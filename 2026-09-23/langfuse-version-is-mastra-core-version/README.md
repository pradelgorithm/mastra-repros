# Every Langfuse observation's `version` is the @mastra/core package version

- `SpanConverter` stamps the OTel resource with `service.version` = the installed `@mastra/core` version.
- Langfuse sets an observation's (and trace's) `version` from the span attribute `langfuse.version`, falling back
  to the resource's `service.version`.
- `@mastra/langfuse` maps `tracingOptions.metadata.version` (documented as a key that "maps to a dedicated Langfuse
  field") to `langfuse.trace.version`, which is not a Langfuse attribute, so the fallback always wins.
- `LangfuseExporter` creates its `SpanConverter` without a config, so there is no `resourceAttributes` override
  either.

Result: every Mastra observation in Langfuse shows `version: "<@mastra/core version>"` and the application's version
cannot be set.

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced
```

`harness.mjs` holds a hand-written `LanguageModelV2` fake model (no API keys) and patches
`LangfuseSpanProcessor.prototype.onEnd` so the spans `@mastra/langfuse` hands to Langfuse's processor are recorded
in memory instead of being sent.

Output: [`output.txt`](./output.txt) — resource `service.version: '1.69.0'`; every span has
`langfuse.trace.version = my-app-2.3.1`, no `langfuse.version`, so Langfuse's version resolves to `1.69.0`.

Versions: `@mastra/core` 1.69.0, `@mastra/observability` 1.18.0, `@mastra/langfuse` 1.5.9, `@mastra/otel-exporter` 1.4.1
([`envinfo.txt`](./envinfo.txt)).
