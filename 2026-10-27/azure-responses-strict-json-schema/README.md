# Structured output through `AzureOpenAIGateway` (Responses API) is never prepared for strict mode

The same `Agent.generate(..., { structuredOutput })` call goes out differently depending on how the OpenAI model is
reached:

| Model | `text.format.strict` | schema prepared for strict (`note`, `qty` in `required`) | `tools[].strict` |
| --- | --- | --- | --- |
| `openai/gpt-5.4` (model router) | `true` | yes | not sent |
| `azure-openai/<deployment>` via `AzureOpenAIGateway({ useResponsesAPI: true })` | `false` | no | `false` |
| same, with `providerOptions.azure.strictJsonSchema: true` | `true` | **no** | `true` |

- `usesOpenAIStrictJsonSchema` returns true only for a provider id matching `/^openai(\.|$)/`, and returns false for
  any `ModelRouterLanguageModel` otherwise, so `prepareJsonSchemaForOpenAIStrictMode` never runs for the Azure
  gateway, although Azure OpenAI serves the same Responses API and the same models.
- The gateway's bundled `@ai-sdk/azure` 2.0.142 / `@ai-sdk/openai` 2.0.135 (AI SDK 5 line) defaults
  `strictJsonSchema` to `false` and sends that one flag as both `text.format.strict` and every function tool's
  `strict`, so strict output cannot be turned on without also turning on strict tools.

Against a real Azure OpenAI resource (`gpt-6.1-terra`, [`output-live.txt`](./output-live.txt)):

- default options: the model omits a required nullable key and Mastra's validation fails —
  `Structured output validation failed: - items: Invalid input: expected array, received undefined`;
- `strictJsonSchema: true`: the endpoint refuses the unprepared schema — `Invalid schema for response_format
  'response': ... 'required' is required to be supplied and to be an array including every key in properties.
  Missing 'qty'.`

## Run

```bash
npm i
node repro.mjs   # exit 1 = reproduced (fetch is stubbed; no keys, no network)
LIVE=1 AZURE_RESOURCE=<name> AZURE_KEY=<key> AZURE_DEPLOYMENT=<gpt deployment> node repro.mjs
```

Output: [`output.txt`](./output.txt) (stubbed) and [`output-live.txt`](./output-live.txt) (resource name redacted).

Versions: `@mastra/core` 1.79.0, `zod` 4.6.7 ([`envinfo.txt`](./envinfo.txt)).
