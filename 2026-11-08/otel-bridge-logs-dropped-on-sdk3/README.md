# `@mastra/otel-bridge` drops every log in an app on OpenTelemetry JS SDK 3

Filed as [mastra-ai/mastra#29695](https://github.com/mastra-ai/mastra/issues/29695).

The bridge forwards Mastra logs to the app's global OpenTelemetry `LoggerProvider`, which it reads through `logs`
from `@opentelemetry/api-logs` ([bridge.ts#L31](https://github.com/mastra-ai/mastra/blob/e3cac09ebd2f3009373cf2d42fb7d45821224fe1/observability/otel-bridge/src/bridge.ts#L31),
[L96](https://github.com/mastra-ai/mastra/blob/e3cac09ebd2f3009373cf2d42fb7d45821224fe1/observability/otel-bridge/src/bridge.ts#L96),
[L481](https://github.com/mastra-ai/mastra/blob/e3cac09ebd2f3009373cf2d42fb7d45821224fe1/observability/otel-bridge/src/bridge.ts#L481)).
OpenTelemetry JS SDK 3 removed `@opentelemetry/api-logs` and folded the logs API into `@opentelemetry/api` 1.10
([migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md#-opentelemetryapi-logs-package-removed)),
so an app on SDK 3 registers its `LoggerProvider` there. The `api-logs` 0.223 copy the bridge brings never sees it
and returns a `ProxyLoggerProvider`, so every log is dropped with no error. Spans still arrive, because the bridge
reads the tracer provider through `@opentelemetry/api`.

## Run

```bash
npm i && node repro.mjs                                   # SDK 3: exit 1 = reproduced
cd control-sdk2 && npm i && node ../repro.mjs .           # SDK 2 control: exit 0
```

No API keys, no network. Each setup registers its SDK the way its own line documents it (SDK 3: `TracerProvider`
from `@opentelemetry/sdk-trace`, `logs` from `@opentelemetry/api`; SDK 2: `BasicTracerProvider` from
`@opentelemetry/sdk-trace-base`, `logs` from `@opentelemetry/api-logs`), then sends one Mastra span
(`DefaultObservabilityInstance` with the bridge) and one Mastra log (`bridge.onLogEvent`) and counts what the app's
in-memory exporters received.

Output ([`output.txt`](./output.txt)):

| App | Bridge's `LoggerProvider` | Spans | Logs |
| --- | --- | --- | --- |
| OpenTelemetry JS SDK 3.1.0, api 1.10.0 | `ProxyLoggerProvider` | 1 | **0** |
| OpenTelemetry JS SDK 2.12.0, api 1.9.1 (control) | the app's provider | 1 | 1 |

Versions: `@mastra/core` 1.82.0, `@mastra/observability` 1.23.1, `@mastra/otel-bridge` 1.5.21 ([`envinfo.txt`](./envinfo.txt)).
