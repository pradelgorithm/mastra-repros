# A run nested with `tracingOptions.parentSpanId` overwrites the Langfuse trace's input/output/name

A run started with `tracingOptions: { traceId, parentSpanId }` has no in-process parent, so its `agent_run` span is
`isRootSpan: true` (with the given id as `externalParentSpanId`). `@mastra/otel-exporter` correctly exports it as a
child of that span, but `@mastra/langfuse`'s `mapMastraToLangfuseAttributes` writes `langfuse.trace.input`,
`langfuse.trace.output`, the fallback `langfuse.trace.name` and `langfuse.trace.metadata.*` for every
`span.isRootSpan`. Langfuse applies `langfuse.trace.*` from any span of the trace, so the nested run (an LLM judge
here) replaces the outer run's trace name, input and output.

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced
```

`harness.mjs` holds a hand-written `LanguageModelV2` fake model (no API keys) and patches
`LangfuseSpanProcessor.prototype.onEnd` so the spans `@mastra/langfuse` hands to Langfuse's processor are recorded
in memory instead of being sent.

Output: [`output.txt`](./output.txt) — the judge's `agent_run` has the outer run's traceId and the outer
`agent_run` as OTel parent, yet carries `langfuse.trace.name = judge` and the judge's input/output.

Versions: `@mastra/core` 1.69.0, `@mastra/observability` 1.18.0, `@mastra/langfuse` 1.5.9, `@mastra/otel-exporter` 1.4.1
([`envinfo.txt`](./envinfo.txt)).
