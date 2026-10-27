// Structured output through AzureOpenAIGateway (useResponsesAPI) is never prepared for OpenAI strict
// mode, while the same Agent call on `openai/*` is.
//
// Keyless by default: `fetch` is stubbed and every request body is recorded.
//   npm i && node repro.mjs                          # exit 1 = reproduced
// Against a real Azure OpenAI resource (prints what the endpoint answers):
//   LIVE=1 AZURE_RESOURCE=<name> AZURE_KEY=<key> AZURE_DEPLOYMENT=<gpt deployment> node repro.mjs
import { Agent } from '@mastra/core/agent';
import { AzureOpenAIGateway, ModelRouterLanguageModel } from '@mastra/core/llm';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const live = process.env.LIVE === '1';
const realFetch = globalThis.fetch;
let captured;
globalThis.fetch = async (url, init) => {
  captured = { url: String(url), body: JSON.parse(String(init?.body)) };
  if (live && String(url).includes('.openai.azure.com')) return realFetch(url, init);
  return new Response(JSON.stringify({ error: { message: 'stubbed', type: 'stub' } }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};

// `note` is optional (not nullable): strict mode needs it in `required`, which is what
// `prepareJsonSchemaForOpenAIStrictMode` does for `openai/*`.
const output = z.object({
  reply: z.string(),
  note: z.string().optional(),
  items: z.array(z.object({ name: z.string(), qty: z.number().optional() })).nullable(),
});
const lookup = createTool({
  id: 'lookup',
  description: 'Look something up',
  inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
  execute: async () => ({ ok: true }),
});

process.env.OPENAI_API_KEY ??= 'sk-stub';
const azure = () =>
  new ModelRouterLanguageModel(`azure-openai/${process.env.AZURE_DEPLOYMENT ?? 'gpt-5.4'}`, [
    new AzureOpenAIGateway({
      resourceName: process.env.AZURE_RESOURCE ?? 'my-resource',
      apiKey: process.env.AZURE_KEY ?? 'stub',
      useResponsesAPI: true,
    }),
  ]);

async function send(label, model, providerOptions) {
  captured = undefined;
  const agent = new Agent({
    id: 'repro',
    name: 'repro',
    instructions: 'Answer.',
    model,
    tools: { lookup },
  });
  let error;
  try {
    await agent.generate('hola', { structuredOutput: { schema: output }, providerOptions, maxSteps: 1 });
  } catch (e) {
    error = e;
  }
  const b = captured?.body ?? {};
  const fmt = b.text?.format ?? {};
  const seen = {
    url: captured?.url?.replace(/https:\/\/[^.]+\.openai\.azure/, 'https://<resource>.openai.azure'),
    'text.format.strict': fmt.strict,
    'text.format.schema.required': fmt.schema?.required,
    'items[].required': fmt.schema?.properties?.items?.anyOf?.[0]?.items?.required,
    'tools[0].strict': b.tools?.[0]?.strict,
  };
  console.log(`\n### ${label}\n${JSON.stringify(seen, null, 2)}`);
  if (live && label.startsWith('azure')) {
    const message = error?.message ?? String(error ?? 'no error');
    console.log(`endpoint answered: ${message.slice(0, 300)}`);
  }
  return seen;
}

console.log(`@mastra/core ${(await import('@mastra/core/package.json', { with: { type: 'json' } })).default.version}`);
const openai = await send('openai/gpt-5.4 (model router, default options)', 'openai/gpt-5.4');
const azureDefault = await send('azure-openai via AzureOpenAIGateway (default options)', azure());
const azureStrict = await send(
  'azure-openai via AzureOpenAIGateway, providerOptions.azure.strictJsonSchema: true',
  azure(),
  { azure: { strictJsonSchema: true } },
);

const prepared = (seen) => seen['text.format.schema.required']?.includes('note') === true;
const reproduced =
  openai['text.format.strict'] === true &&
  prepared(openai) &&
  (azureDefault['text.format.strict'] !== true || !prepared(azureDefault)) &&
  azureStrict['text.format.strict'] === true &&
  !prepared(azureStrict);
console.log(
  reproduced
    ? '\nREPRODUCED: openai/* gets a prepared strict schema; azure-openai/* gets strict:false, and with strictJsonSchema:true an UNPREPARED schema (note/qty missing from required) plus strict tools.'
    : '\nNOT REPRODUCED',
);
process.exit(reproduced ? 1 : 0);
