// The MODEL_STEP span's metadata carries the provider's raw HTTP response: `body` (the whole JSON the provider
// returned, on the generate() path) and `headers` (on both generate() and stream()). Every exporter receives it;
// @mastra/langfuse exports it as `mastra.metadata.body` / `mastra.metadata.headers`.
//
// The fake model returns what an AI SDK provider returns from doGenerate()/doStream(): `response.headers` and,
// for doGenerate(), `response.body` — here a synthetic, Responses-API-shaped body of ~170 KB (the size seen on a
// real Azure OpenAI gpt-6-luna call) and headers with fake request ids.
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { TracingEventType } from '@mastra/core/observability';
import { BaseExporter, Observability } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import { captureLangfuse, flush, createFakeModel } from './harness.mjs';

const langfuseSpans = captureLangfuse();

/** Records the raw exported Mastra spans (what EVERY exporter receives). */
class CaptureExporter extends BaseExporter {
  name = 'capture';
  spans = [];
  async _exportTracingEvent(event) {
    if (event.type === TracingEventType.SPAN_ENDED) this.spans.push(event.exportedSpan);
  }
  async shutdown() {}
}
const capture = new CaptureExporter();

const responseHeaders = {
  'content-type': 'application/json',
  'content-length': '173412',
  'x-request-id': 'req_00000000000000000000000000000000',
  'apim-request-id': '00000000-0000-0000-0000-000000000000',
  'azureai-processed-tokens': '41079',
  'x-ratelimit-remaining-tokens': '1998000',
};
const responseBody = {
  id: 'resp_fake',
  object: 'response',
  model: 'gpt-6-luna',
  status: 'completed',
  output: [
    { id: 'rs_fake', type: 'reasoning', summary: [], encrypted_content: 'gAAAAA'.padEnd(110_000, 'x') },
    {
      id: 'msg_fake',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', annotations: [], text: 'Your order ships Friday. '.repeat(2_400) }],
    },
  ],
  content_filters: [{ blocked: false, source_type: 'completion', content_filter_results: { hate: { filtered: false, severity: 'safe' } } }],
  usage: { input_tokens: 39056, output_tokens: 2023, output_tokens_details: { reasoning_tokens: 1632 }, total_tokens: 41079 },
};

const agent = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'Answer the customer.',
  model: createFakeModel({ modelId: 'gpt-6-luna', text: 'Your order ships Friday.', responseHeaders, responseBody }),
});
const mastra = new Mastra({
  agents: { assistant: agent },
  logger: false,
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra-repro',
        exporters: [
          capture,
          new LangfuseExporter({ publicKey: 'pk-lf-fake', secretKey: 'sk-lf-fake', baseUrl: 'http://127.0.0.1:9' }),
        ],
      },
    },
  }),
});

console.log(`provider response body: ${JSON.stringify(responseBody).length.toLocaleString()} bytes of JSON\n`);

let reproduced = false;
for (const method of ['generate', 'stream']) {
  const before = { raw: capture.spans.length, lf: langfuseSpans.length };
  if (method === 'generate') {
    await mastra.getAgent('assistant').generate('When does my order ship?');
  } else {
    const out = await mastra.getAgent('assistant').stream('When does my order ship?');
    await out.text;
  }
  await flush(mastra);

  const rawStep = capture.spans.slice(before.raw).find(s => s.type === 'model_step');
  const lfStep = langfuseSpans.slice(before.lf).find(s => s.attributes['mastra.span.type'] === 'model_step');

  console.log(`agent.${method}() — model_step span`);
  console.log('  exported span.metadata keys:', Object.keys(rawStep?.metadata ?? {}));
  const body = lfStep?.attributes['mastra.metadata.body'];
  const headers = lfStep?.attributes['mastra.metadata.headers'];
  console.log(`  Langfuse attribute mastra.metadata.body   : ${body ? `${String(body).length.toLocaleString()} chars, starts ${String(body).slice(0, 90)}…` : '(absent)'}`);
  console.log(`  Langfuse attribute mastra.metadata.headers: ${headers ?? '(absent)'}\n`);
  if (body || headers) reproduced = true;
}

if (reproduced) {
  console.error(
    'REPRODUCED: the provider\'s raw response body (generate) and response headers (generate + stream) are attached to the ' +
      'model_step span metadata and exported by default.',
  );
  process.exitCode = 1;
} else {
  console.log('NOT REPRODUCED: no raw response body/headers on model_step.');
}
