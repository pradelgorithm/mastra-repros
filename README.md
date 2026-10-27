# mastra-repros

Minimal, keyless reproductions for issues filed against [mastra-ai/mastra](https://github.com/mastra-ai/mastra).

Every reproduction drives a `Mastra` `Agent` with a fake in-memory model or a stubbed `fetch` —
**no API keys and no network calls** by default.

| Batch | Contents |
| --- | --- |
| [`2026-09-18/bugs`](./2026-09-18/bugs) | `@mastra/core` 1.68.0-alpha.6 — structured output, model-chain failover, tripwires, timeouts |
| [`2026-09-18/features`](./2026-09-18/features) | `@mastra/core` 1.68.0-alpha.6 — processor retries, supportedUrls, logger bypass, fallback providerOptions |
| [`2026-09-23`](./2026-09-23) | `@mastra/core` 1.69.0 + `@mastra/langfuse` 1.5.9 — Langfuse usage/cost, trace-level fields, span metadata, version |
| [`2026-10-27`](./2026-10-27) | `@mastra/core` 1.79.0 — structured output through `AzureOpenAIGateway` (Responses API) never prepared for strict mode |
