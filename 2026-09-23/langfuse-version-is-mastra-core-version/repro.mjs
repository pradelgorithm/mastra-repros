// Every observation @mastra/langfuse exports ends up with Langfuse `version` = the installed @mastra/core
// version, and there is no working way to set the application's version:
//
//   - SpanConverter stamps the OTel resource with `service.version` = @mastra/core's package version.
//   - Langfuse reads an observation's (and trace's) `version` from the span attribute `langfuse.version`,
//     falling back to the resource's `service.version`.
//   - `tracingOptions.metadata.version` — documented as mapping to a dedicated Langfuse field — is written to
//     `langfuse.trace.version`, an attribute Langfuse does not read, so the fallback always wins.
//   - LangfuseExporter builds its SpanConverter without a config, so `resourceAttributes` cannot override it.
import { createRequire } from 'node:module';
import { Agent } from '@mastra/core/agent';
import { captureLangfuse, mastraWithLangfuse, flush, createFakeModel } from './harness.mjs';

const require = createRequire(import.meta.url);
const coreVersion = require('@mastra/core/package.json').version;
const APP_VERSION = 'my-app-2.3.1';

const spans = captureLangfuse();
const agent = new Agent({ id: 'assistant', name: 'assistant', instructions: 'Be brief.', model: createFakeModel() });
const mastra = mastraWithLangfuse({
  agents: { assistant: agent },
  // Not a declared LangfuseExporterConfig field; passed to show it has no effect on the resource.
  exporterConfig: { release: APP_VERSION, resourceAttributes: { 'service.version': APP_VERSION } },
});

await mastra.getAgent('assistant').generate('hi', { tracingOptions: { metadata: { version: APP_VERSION } } });
await flush(mastra);

console.log(`installed @mastra/core: ${coreVersion}; application version we tried to set: ${APP_VERSION}\n`);
console.log('OTel resource attached to every exported span:', spans[0].resource.attributes, '\n');

// Langfuse OTLP ingestion: version = attributes['langfuse.version'] ?? resource['service.version'] ?? null
// https://github.com/langfuse/langfuse/blob/b979116fdcc0151b923268956e02dd74cc2c8132/packages/shared/src/server/otel/OtelIngestionProcessor.ts#L1265-L1268
const langfuseVersion = s => s.attributes['langfuse.version'] ?? s.resource.attributes['service.version'] ?? null;

const rows = spans.map(s => ({
  span: s.name,
  'langfuse.version': s.attributes['langfuse.version'] ?? '(unset)',
  'langfuse.trace.version': s.attributes['langfuse.trace.version'] ?? '(unset)',
  'langfuse.release': s.attributes['langfuse.release'] ?? '(unset)',
  '=> Langfuse version': langfuseVersion(s),
}));
console.table(rows);

if (spans.every(s => langfuseVersion(s) === coreVersion)) {
  console.error(
    `\nREPRODUCED: every observation (and the trace) gets version "${coreVersion}" — the @mastra/core package version. ` +
      `metadata.version went to langfuse.trace.version (not a Langfuse attribute), and resourceAttributes was ignored.`,
  );
  process.exitCode = 1;
} else {
  console.log('\nNOT REPRODUCED: Langfuse version is not the @mastra/core version.');
}
