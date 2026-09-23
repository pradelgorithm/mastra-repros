# @mastra/langfuse prices reasoning tokens twice

`@mastra/otel-exporter`'s `formatUsageMetrics` exports `gen_ai.usage.output_tokens = usage.outputTokens` (Mastra's
`UsageStats.outputTokens` is the **total**, reasoning included) **and** `gen_ai.usage.reasoning_tokens =
usage.outputDetails.reasoning`. Langfuse's OTLP ingestion only subtracts the spec-named
`gen_ai.usage.reasoning.output_tokens` from `output`; `reasoning_tokens` is kept as one more usage bucket. The
generation's total becomes output + reasoning + input, and a price definition with a `reasoning_tokens` price
(Langfuse's managed OpenAI reasoning models have one) charges every reasoning token twice.

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced
```

`harness.mjs` holds a hand-written `LanguageModelV2` fake model (no API keys) and patches
`LangfuseSpanProcessor.prototype.onEnd` so the spans `@mastra/langfuse` hands to Langfuse's processor are
recorded in memory instead of being sent. The fake model reports the usage measured on a real gpt-6-luna generation
(input 39,056 · output 2,023 of which reasoning 1,632 · total 41,079).

`repro.mjs` then runs those exported attributes through a port of Langfuse's
[`extractGenericGenAiUsageDetails`](https://github.com/langfuse/langfuse/blob/b979116fdcc0151b923268956e02dd74cc2c8132/packages/shared/src/server/otel/OtelIngestionProcessor.ts#L3074-L3215)
and applies Langfuse's managed gpt-6-luna price definition
([default-model-prices.json](https://github.com/langfuse/langfuse/blob/b979116fdcc0151b923268956e02dd74cc2c8132/worker/src/constants/default-model-prices.json)).

Output: [`output.txt`](./output.txt) — 42,711 tokens / $0.0057331 instead of 41,079 / $0.0049171 (+16.6%), the same
numbers Langfuse stored for the production generation.

Versions: `@mastra/core` 1.69.0, `@mastra/observability` 1.18.0, `@mastra/langfuse` 1.5.9, `@mastra/otel-exporter` 1.4.1
([`envinfo.txt`](./envinfo.txt)).
