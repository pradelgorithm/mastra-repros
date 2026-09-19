import { Agent } from '@mastra/core/agent';
let calls = 0; const seen = [];
const fake = { specificationVersion: 'v2', provider: 'fake', modelId: 'f', supportedUrls: {},
  async doStream() { calls++; throw new Error('boom'); },
  async doGenerate() { calls++; throw new Error('boom'); } };
const errorProcessor = { name: 'retry-forever', async processAPIError({ retryCount }) { seen.push(retryCount); return { retry: true }; } };
const agent = new Agent({ name: 'a', instructions: 'i', model: fake, errorProcessors: [errorProcessor] });
try { await agent.generate('hi', { maxRetries: 0, maxSteps: 50 }); } catch (e) { console.log('failed:', e.message?.slice(0, 60)); }
console.log('model invocations =', calls);
console.log('processAPIError retryCounts =', seen);
