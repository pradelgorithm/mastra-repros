import { Agent, tryGenerateWithJsonFallback } from '@mastra/core/agent';
import { ConsoleLogger } from '@mastra/core/logger';
import { z } from 'zod';
const gen = { content: [{ type: 'text', text: 'not json' }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] };
const fake = { specificationVersion: 'v2', provider: 'fake', modelId: 'f', supportedUrls: {},
  async doGenerate() { return gen; },
  async doStream() { return { stream: new ReadableStream({ start(c) { c.enqueue({type:'stream-start',warnings:[]}); c.enqueue({type:'text-start',id:'0'}); c.enqueue({type:'text-delta',id:'0',delta:'not json'}); c.enqueue({type:'text-end',id:'0'}); c.enqueue({type:'finish',finishReason:'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}}); c.close(); } }) }; } };
const captured = [];
const logger = new ConsoleLogger({ level: 'error' });
logger.warn = (...a) => captured.push(['LOGGER.warn', ...a]);
const agent = new Agent({ name: 'a', instructions: 'i', model: fake, logger });
const origWarn = console.warn; const consoleWarns = [];
console.warn = (...a) => consoleWarns.push(String(a[0]));
try { await tryGenerateWithJsonFallback(agent, 'q', { structuredOutput: { schema: z.object({ a: z.string() }) } }); } catch {}
console.warn = origWarn;
console.log('console.warn calls:', consoleWarns);
console.log('logger.warn calls:', captured.length);
