# Mastra reproductions — 2026-11-08 (span filtering, OpenTelemetry JS SDK 3)

Against `@mastra/core` 1.82.0 and `@mastra/observability` 1.23.1 (the newest published versions on 2026-11-08), plus
the newest `@mastra/otel-*` and exporter packages. Two topics:

- **Span filtering.** Found while trimming per-span-billed Langfuse traces: we want to drop the `model_generation` and
  `model_step` wrappers of single-step structured-output calls only, which `excludeSpanTypes` (per type, for every
  agent) cannot express.
- **OpenTelemetry JS SDK 3** (`@opentelemetry/core` 3.0.0, `api` 1.10.0, experimental 0.300.0, released 2026-10-20).
  Our app moved to it, and the Mastra observability packages still require SDK 2.

```bash
cd <folder> && npm i && node repro.mjs   # exit 1 = reproduced
```

| Folder | What it shows | Verdict | Issue |
| --- | --- | --- | --- |
| [`span-filter-orphans-children`](./span-filter-orphans-children) | `spanFilter` leaves the children of a dropped span pointing at it (`excludeSpanTypes` re-parents them since mastra-ai/mastra#20881), and can drop a span's `SPAN_ENDED` after exporting its `SPAN_STARTED` | REPRODUCED | [#29693](https://github.com/mastra-ai/mastra/issues/29693) |
| [`otel-bridge-logs-dropped-on-sdk3`](./otel-bridge-logs-dropped-on-sdk3) | In an app on OpenTelemetry JS SDK 3, `@mastra/otel-bridge` drops every log: it reads the LoggerProvider through `@opentelemetry/api-logs`, which SDK 3 removed. Spans still arrive. SDK 2 control delivers both | REPRODUCED | (pending) |
| [`observability-on-otel-sdk3`](./observability-on-otel-sdk3) | `./install-matrix.sh`: in an app on SDK 3, `@mastra/langfuse` fails `npm i` (ERESOLVE); `otel-exporter`, `otel-bridge`, `arize`, `arthur` and `laminar` install a second SDK (2.12) and a second `@opentelemetry/api` (1.9.1) | REPRODUCED | (pending) |
