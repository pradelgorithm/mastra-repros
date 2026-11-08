# Mastra reproductions — 2026-11-08 (span filtering)

Against `@mastra/core` 1.82.0 and `@mastra/observability` 1.23.1 (the newest published versions on 2026-11-08). Found
while trimming per-span-billed Langfuse traces: we want to drop the `model_generation` and `model_step` wrappers of
single-step structured-output calls only, which `excludeSpanTypes` (per type, for every agent) cannot express.

```bash
cd <folder> && npm i && node repro.mjs   # exit 1 = reproduced
```

| Folder | What it shows | Verdict | Issue |
| --- | --- | --- | --- |
| [`span-filter-orphans-children`](./span-filter-orphans-children) | `spanFilter` leaves the children of a dropped span pointing at it (`excludeSpanTypes` re-parents them since mastra-ai/mastra#20881), and can drop a span's `SPAN_ENDED` after exporting its `SPAN_STARTED` | REPRODUCED | [#29693](https://github.com/mastra-ai/mastra/issues/29693) |
