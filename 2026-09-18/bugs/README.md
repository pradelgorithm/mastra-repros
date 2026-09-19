# Mastra reproductions — 2026-09-18 (bugs batch)

Keyless reproductions against `@mastra/core@1.68.0-alpha.6`.
Originally hit in production on `@mastra/core@1.67.0-alpha.3`.

Every case drives an `Agent` with a **fake in-memory `LanguageModelV2`** (`fake-model.mjs`)
that records each call's `options` (prompt, `responseFormat`, `providerOptions`, `abortSignal`)
and replays a scripted chunk list. **No API keys and no network calls are involved.**

## Run

```bash
npm i --legacy-peer-deps
node repro-a1.mjs      # exits 1 when the bug reproduces, 0 when it does not
```

Verbatim output of each run is committed under [`outputs/`](./outputs).

## Cases

| Script | What it shows | Verdict | Issue |
| --- | --- | --- | --- |
| [`repro-a1.mjs`](./repro-a1.mjs) | `StructuredOutputProcessor.generateInstructions()` says "matches the following schema:" and never includes the schema | REPRODUCED | _(see table below)_ |
| [`repro-a2.mjs`](./repro-a2.mjs) | `structuredOutput.jsonPromptInjection: false` is a no-op once `structuredOutput.model` is set — the full JSON schema is injected on every step | REPRODUCED | |
| [`repro-a3.mjs`](./repro-a3.mjs) | A model chain that **recovers** still logs twice at `error` level, with no `warn` downgrade and no terminal marker | REPRODUCED | |
| [`repro-a4.mjs`](./repro-a4.mjs) | Structured output ignores `finishReason: 'length'`; truncated JSON is repaired into a "valid" object | REPRODUCED | |
| [`repro-a7.mjs`](./repro-a7.mjs) | An output-processor tripwire blanks `result.text` while `steps[].text` and `response.messages` keep the prose (and only one of the three tripwire hooks does it) | REPRODUCED | |
| [`repro-a8.mjs`](./repro-a8.mjs) | On the processor path the `MastraError` is flattened into a tripwire string: no Zod issues, no `details.value`, no raw model output | REPRODUCED | |
| [`repro-a9.mjs`](./repro-a9.mjs) | A caller abort mid-structuring leaves the processor enqueuing into a closed controller (`ERR_INVALID_STATE`) | REPRODUCED | |
| [`repro-b2.mjs`](./repro-b2.mjs) | Does `buildStructuringPrompt` ever hand the structurer an empty prompt? | **NOT REPRODUCED** — both `stream()` and `generate()` pass the primary text | not filed |
| [`repro-b4.mjs`](./repro-b4.mjs) | `new Proxy(modelRouterModel, {})` breaks on the `#lastStreamTransport` private field | expected JS behaviour | not filed |
| [`repro-b5.mjs`](./repro-b5.mjs) | `modelSettings.timeout` as a plain number silently disables every timeout | REPRODUCED | |

Issue links are filled in below once each report is filed.
