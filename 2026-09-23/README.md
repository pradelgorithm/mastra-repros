# Mastra reproductions — 2026-09-23 (Langfuse tracing batch)

Keyless reproductions against `@mastra/core` 1.69.0, `@mastra/observability` 1.18.0, `@mastra/langfuse` 1.5.9 and
`@mastra/otel-exporter` 1.4.1 (the newest published versions on 2026-09-23). Originally found in production traces on
`@mastra/core` 1.67.0-alpha.3 / `@mastra/langfuse` 1.5.7-alpha.1.

Each folder is self-contained (its own `package.json`, `harness.mjs`, `repro.mjs`, verbatim `output.txt`,
`envinfo.txt`). Every case drives a real `Agent` + real `LangfuseExporter` with a **hand-written `LanguageModelV2`
fake model** and a patched `LangfuseSpanProcessor.prototype.onEnd`, so the spans Mastra hands to Langfuse are
recorded in memory. **No API keys and no network calls.**

```bash
cd <folder> && npm i && node repro.mjs   # exit 1 = reproduced
```

| Folder | What it shows | Verdict | Issue |
| --- | --- | --- | --- |
| [`langfuse-reasoning-tokens-double-priced`](./langfuse-reasoning-tokens-double-priced) | `output_tokens` (includes reasoning) + `reasoning_tokens` are two Langfuse buckets: 42,711 tokens / +16.6% cost instead of 41,079 | REPRODUCED | [#24824](https://github.com/mastra-ai/mastra/issues/24824) |
| [`langfuse-external-parent-overwrites-trace-io`](./langfuse-external-parent-overwrites-trace-io) | A run nested with `tracingOptions.parentSpanId` writes `langfuse.trace.input/output/name` and replaces the outer trace's | REPRODUCED | [#24825](https://github.com/mastra-ai/mastra/issues/24825) |
| [`model-step-metadata-raw-provider-response`](./model-step-metadata-raw-provider-response) | `model_step` metadata exports the provider's raw response `body` (170 KB here) and `headers` | REPRODUCED | [#24826](https://github.com/mastra-ai/mastra/issues/24826) |
| [`langfuse-version-is-mastra-core-version`](./langfuse-version-is-mastra-core-version) | Langfuse `version` is always the `@mastra/core` version; `metadata.version` goes to a non-Langfuse attribute | REPRODUCED | [#24827](https://github.com/mastra-ai/mastra/issues/24827) |
