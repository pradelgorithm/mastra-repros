# Mastra reproductions — 2026-10-27 (Azure Responses structured output)

Against `@mastra/core` 1.79.0 (the newest published version on 2026-10-27). Found on `@mastra/core` 1.75.0 in an
eval of `gpt-6.1-terra` on Azure OpenAI: 9 % of its structured objects matched the schema before repair, and 5 of 67
turns lost the object to `errorStrategy: 'fallback'`.

```bash
cd <folder> && npm i && node repro.mjs   # exit 1 = reproduced
```

| Folder | What it shows | Verdict | Issue |
| --- | --- | --- | --- |
| [`azure-responses-strict-json-schema`](./azure-responses-strict-json-schema) | `AzureOpenAIGateway` sends `strict: false` and never prepares the schema; `strictJsonSchema: true` sends an unprepared schema and strict tools | REPRODUCED | (pending) |
