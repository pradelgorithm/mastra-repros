# `model_step` span metadata carries the provider's raw HTTP response body and headers

The agentic loop builds each step's `step-finish` metadata as
`{ providerMetadata, ...responseMetadata, ...rawResponse, modelMetadata, headers: rawResponse?.headers, request }`,
where `rawResponse` is the `response` object the model returned (`response.body` + `response.headers` from
`doGenerate()`, `response.headers` from `doStream()`). `ModelSpanTracker#endStepSpan` strips `request`, `id`,
`timestamp`, `modelId`, `modelVersion` and `modelProvider` from it, but not `body` or `headers`, so both are set as
MODEL_STEP span metadata and reach every exporter (`@mastra/langfuse` exports them as `mastra.metadata.body` and
`mastra.metadata.headers`).

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced
```

`harness.mjs` holds a hand-written `LanguageModelV2` fake model (no API keys) whose `doGenerate()` returns
`response: { headers, body }` and whose `doStream()` returns `response: { headers }`, as AI SDK providers do. The body
is a synthetic ~170 KB Responses-API-shaped JSON and the headers carry fake request ids. A small `BaseExporter`
subclass records the raw exported spans; `LangfuseSpanProcessor.prototype.onEnd` is patched to record what
`@mastra/langfuse` would send.

Output: [`output.txt`](./output.txt) — `agent.generate()`: `model_step` metadata keys `runId, headers, body,
modelMetadata`, `mastra.metadata.body` = 170,538 chars; `agent.stream()`: `headers` only.

Versions: `@mastra/core` 1.69.0, `@mastra/observability` 1.18.0, `@mastra/langfuse` 1.5.9, `@mastra/otel-exporter` 1.4.1
([`envinfo.txt`](./envinfo.txt)).
