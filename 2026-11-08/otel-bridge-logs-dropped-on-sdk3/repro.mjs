// @mastra/otel-bridge forwards Mastra logs to the app's global OpenTelemetry LoggerProvider, which it reads through
// `logs` from @opentelemetry/api-logs (bridge.ts L31, L96, L481). OpenTelemetry JS SDK 3 removed @opentelemetry/api-logs
// and folded the logs API into @opentelemetry/api 1.10, so an app on SDK 3 registers its LoggerProvider there. The
// api-logs 0.223 copy the bridge brings never sees it and hands back a ProxyLoggerProvider: every log is dropped,
// with no error. Spans still arrive, because the bridge reads the tracer provider through @opentelemetry/api.
//
// Run in this folder (OpenTelemetry SDK 3), or `cd control-sdk2 && npm i && node ../repro.mjs .` (SDK 2).
// Each setup registers its SDK the way its own line documents it, then sends one Mastra span and one Mastra log
// through the bridge and counts what the app's in-memory exporters received.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '.');
const require = createRequire(`${root}/package.json`);
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const versionOf = (name) => JSON.parse(readFileSync(`${root}/node_modules/${name}/package.json`, 'utf8')).version;

const api = await load('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = await load('@opentelemetry/context-async-hooks');
const sdkLogs = await load('@opentelemetry/sdk-logs');
const sdkVersion = versionOf('@opentelemetry/sdk-logs');
const onSdk3 = sdkVersion.startsWith('3.');

// Traces: SDK 3 replaces sdk-trace-base with sdk-trace and takes processor options as an object.
const traceSdk = onSdk3 ? await load('@opentelemetry/sdk-trace') : await load('@opentelemetry/sdk-trace-base');
const spanExporter = new traceSdk.InMemorySpanExporter();
const spanProcessor = new traceSdk.SimpleSpanProcessor(onSdk3 ? { exporter: spanExporter } : spanExporter);
const TracerProvider = traceSdk.TracerProvider ?? traceSdk.BasicTracerProvider;
api.trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [spanProcessor] }));
api.context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

// Logs: SDK 3 registers through @opentelemetry/api; SDK 2 through @opentelemetry/api-logs.
const logsApi = onSdk3 ? api.logs : (await load('@opentelemetry/api-logs')).logs;
const logExporter = new sdkLogs.InMemoryLogRecordExporter();
const loggerProvider = new sdkLogs.LoggerProvider({
  processors: [new sdkLogs.SimpleLogRecordProcessor({ exporter: logExporter })],
});
logsApi.setGlobalLoggerProvider(loggerProvider);

// Mastra, with the bridge reading both global providers.
const { SamplingStrategyType, SpanType } = await load('@mastra/core/observability');
const { DefaultObservabilityInstance } = await load('@mastra/observability');
const { OtelBridge } = await load('@mastra/otel-bridge');
const bridge = new OtelBridge();
const tracing = new DefaultObservabilityInstance({
  serviceName: 'repro',
  name: 'repro',
  sampling: { type: SamplingStrategyType.ALWAYS },
  exporters: [],
  bridge,
});
tracing.startSpan({ type: SpanType.AGENT_RUN, name: 'agent run: support-agent' }).end();
await bridge.onLogEvent({
  type: 'log',
  log: { logId: 'log-1', timestamp: new Date(), level: 'warn', message: 'hello from mastra' },
});
await bridge.flush();

const spans = spanExporter.getFinishedSpans().length;
const logs = logExporter.getFinishedLogRecords().length;
const bridgeSees = bridge.loggerProvider === loggerProvider ? 'the app provider' : bridge.loggerProvider?.constructor?.name;
const traceVersion = versionOf(onSdk3 ? '@opentelemetry/sdk-trace' : '@opentelemetry/sdk-trace-base');
console.log(
  `app on OpenTelemetry JS SDK ${traceVersion} (sdk-logs ${sdkVersion}, api ${versionOf('@opentelemetry/api')})`,
);
console.log(`  bridge's LoggerProvider: ${bridgeSees}`);
console.log(`  spans received: ${spans}`);
console.log(`  logs received:  ${logs}`);
const reproduced = spans > 0 && logs === 0;
console.log(reproduced ? 'REPRODUCED: the span arrived, the log was dropped' : 'NOT REPRODUCED: span and log both arrived');
process.exit(reproduced ? 1 : 0);
