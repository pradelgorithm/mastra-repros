# mastra-repros

Minimal, keyless reproductions for issues filed against [mastra-ai/mastra](https://github.com/mastra-ai/mastra).

Every reproduction drives a `Mastra` `Agent` with a fake in-memory `LanguageModelV2` model —
**no API keys and no network calls**.

| Batch | Contents |
| --- | --- |
| [`2026-09-18/bugs`](./2026-09-18/bugs) | `@mastra/core` 1.68.0-alpha.6 — structured output, model-chain failover, tripwires, timeouts |
| [`2026-09-18/features`](./2026-09-18/features) | `@mastra/core` 1.68.0-alpha.6 — processor retries, supportedUrls, logger bypass, fallback providerOptions |
