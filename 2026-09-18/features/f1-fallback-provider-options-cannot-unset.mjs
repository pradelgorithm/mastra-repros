import { Agent } from '@mastra/core/agent';
const seen = [];
function mk(id, fail) {
  return { specificationVersion: 'v2', provider: 'fake', modelId: id, supportedUrls: {},
    async doGenerate(opts) { seen.push([id, JSON.stringify(opts.providerOptions ?? null)]); if (fail) throw new Error('boom');
      return { content: [{ type: 'text', text: 'ok' }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }; },
    async doStream(opts) { seen.push([id, JSON.stringify(opts.providerOptions ?? null)]); if (fail) throw new Error('boom');
      return { stream: new ReadableStream({ start(c) { c.enqueue({type:'stream-start',warnings:[]}); c.enqueue({type:'text-start',id:'0'}); c.enqueue({type:'text-delta',id:'0',delta:'ok'}); c.enqueue({type:'text-end',id:'0'}); c.enqueue({type:'finish',finishReason:'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}}); c.close(); } }) }; } };
}
const agent = new Agent({ name: 'a', instructions: 'i', model: [
  { model: mk('primary', true), maxRetries: 0 },
  { model: mk('fallback', false), maxRetries: 0, providerOptions: { openrouter: { order: undefined } } },
]});
await agent.generate('hi', { providerOptions: { openrouter: { order: ['vendor-a'], reasoning_effort: 'high' } } });
console.log(seen);
