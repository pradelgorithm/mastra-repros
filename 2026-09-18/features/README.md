# Mastra minimal reproductions — 2026-09-18 (features batch)

```bash
npm install --legacy-peer-deps
node c1-error-processor-default-retries.mjs
node c2-supported-urls-swallowed.mjs
node c3-console-warn-bypasses-logger.mjs
node f1-fallback-provider-options-cannot-unset.mjs
```

All scripts use a hand-rolled AI SDK v2 fake model — no API key, no network.
Verified against `@mastra/core@1.68.0-alpha.6` on Node 26.

| script | shows | observed |
| --- | --- | --- |
| `c1-error-processor-default-retries.mjs` | `maxProcessorRetries` defaults to 10 when `errorProcessors` is set | `model invocations = 11` |
| `c2-supported-urls-swallowed.mjs` | `_fetchSupportedUrls()` swallows the auth failure | `supportedUrls = {}`, no log |
| `c3-console-warn-bypasses-logger.mjs` | `tryGenerateWithJsonFallback` warns via `console.warn` | `logger.warn calls: 0` |
| `f1-fallback-provider-options-cannot-unset.mjs` | a fallback entry cannot unset a call-level `providerOptions` key | fallback receives the primary's `openrouter.order` |
