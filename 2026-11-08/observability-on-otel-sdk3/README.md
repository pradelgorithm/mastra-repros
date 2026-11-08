# Mastra's observability packages in an app on OpenTelemetry JS SDK 3

Filed as [mastra-ai/mastra#29696](https://github.com/mastra-ai/mastra/issues/29696).

`./install-matrix.sh` installs each Mastra package that depends on OpenTelemetry into a fresh npm project that is
already on OpenTelemetry JS SDK 3 (`@opentelemetry/api` 1.10.0, `sdk-trace` and `sdk-logs` 3.1.0, plus
`@mastra/core` 1.82.0 and `@mastra/observability` 1.23.1), and reports what npm does. It exits 1 when any package
fails to install or adds a second `@opentelemetry/api`.

```bash
./install-matrix.sh   # exit 1 = reproduced
```

Output ([`output.txt`](./output.txt), npm 11.20.0, 2026-11-08):

| Package | `npm i` | `@opentelemetry/api` copies | `@opentelemetry/core` copies | `sdk-trace-base` | `api-logs` |
| --- | --- | --- | --- | --- | --- |
| `@mastra/otel-exporter` 1.5.1 | installs | 1.10.0, 1.9.1 | 3.1.0 ×1, 2.12.0 ×11 | 2.12.0 | 0.223.0 |
| `@mastra/otel-bridge` 1.5.21 | installs | 1.10.0, 1.9.1 | 3.1.0 ×1, 2.12.0 ×11 | 2.12.0 | 0.223.0 |
| `@mastra/langfuse` 1.6.5 | **ERESOLVE** | — | — | — | — |
| `@mastra/arize` 1.3.29 | installs | 1.10.0, 1.9.1 ×2 | 3.1.0 ×1, 2.12.0 ×12 | 2.12.0 ×2 | 0.223.0 |
| `@mastra/arthur` 0.4.29 | installs | 1.10.0, 1.9.1 ×2 | 3.1.0 ×1, 2.12.0 ×12 | 2.12.0 ×2 | 0.223.0 |
| `@mastra/laminar` 1.3.31 | installs | 1.10.0, 1.9.1 | 3.1.0 ×1, 2.12.0 ×4 | 2.12.0 | 0.223.0 |

`@mastra/langfuse` fails on `peer @opentelemetry/api@">=1.3.0 <1.10.0" from @opentelemetry/sdk-trace-base@2.12.0`
(its own peer `sdk-trace-base ^2.0.1`). The others resolve only by nesting an SDK 2 tree with its own API copy
beside the app's SDK 3.
