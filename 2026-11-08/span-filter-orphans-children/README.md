# `spanFilter` orphans the children of a span it drops

Filed as (issue link pending).

`excludeSpanTypes` and `spanFilter` both drop spans before export. Since #20881 (the fix for #20818), a span dropped
by `excludeSpanTypes` is marked `isExcluded` when it is created, and its children skip it when they resolve their
`parentSpanId`. `spanFilter` runs later, in `getSpanForExport`, on each event of a span. Nothing marks the span, so:

1. **Orphans.** A child of a span that `spanFilter` drops is exported with `parentSpanId` pointing at that span,
   which no exporter ever receives.
2. **A start without an end.** `spanFilter` runs again for `SPAN_STARTED`, `SPAN_UPDATED` and `SPAN_ENDED`. A
   filter that reads end-time data, like the documented "only keep tool calls that failed" example, keeps the
   start and drops the end, so exporters receive a span that never ends.

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced
```

No API keys, no network. `repro.mjs` builds the span tree of one agent turn that calls a tool
(`agent_run → model_generation → model_step → tool_call`) on a `DefaultObservabilityInstance` with a capturing
exporter, three times:

| Case | Config | Result |
| --- | --- | --- |
| A | `excludeSpanTypes: [MODEL_STEP]` | `tool_call` re-parented to `model_generation`, no orphans |
| B | `spanFilter: span => span.type !== MODEL_STEP` | `tool_call` exported with `parentSpanId` = the dropped `model_step` |
| C | `spanFilter` from the config docs ("only keep tool calls that failed") | `tool_call` gets `SPAN_STARTED` and no `SPAN_ENDED` |

Output: [`output.txt`](./output.txt).

Versions: `@mastra/core` 1.82.0, `@mastra/observability` 1.23.1 ([`envinfo.txt`](./envinfo.txt)), the newest published
on 2026-11-08. The same code is on `main` at
[`e3cac09`](https://github.com/mastra-ai/mastra/blob/e3cac09ebd2f3009373cf2d42fb7d45821224fe1/observability/mastra/src/instances/base.ts#L821-L842).
