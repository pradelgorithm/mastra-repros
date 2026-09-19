// A4 — Structured output ignores finishReason:'length'. A response the provider TRUNCATED
// is repaired by parsePartialJson and handed to the caller as a complete, "valid" object.
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({
  name: z.string(),
  items: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

// The model is cut off mid-array: the JSON is NOT closed, and it says so via finishReason.
const TRUNCATED = '{"name":"Ana","items":["lechuga","zanahoria"';

const model = createFakeModel({
  modelId: 'truncating',
  script: [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: TRUNCATED },
    { type: 'text-end', id: '1' },
    { type: 'finish', finishReason: 'length', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 } },
  ],
});

const logger = createCapturingLogger();
const agent = new Agent({ name: 'a4', instructions: 'Extract the order.', model, logger });
const mastra = new Mastra({ agents: { a4: agent }, logger, telemetry: { enabled: false } });

const res = await mastra.getAgent('a4').stream('Ana quiere lechuga y zanahoria y ...', {
  structuredOutput: { schema },
});
const text = await res.text;
const object = await res.object;
const finishReason = await res.finishReason;

console.log('raw model text (truncated by the provider):', JSON.stringify(TRUNCATED));
console.log('result.text        =', JSON.stringify(text));
console.log('result.finishReason=', JSON.stringify(finishReason));
console.log('result.object      =', JSON.stringify(object));
console.log('\nerror-level logs:', logger.errors().map(r => r.message));
console.log('warn-level logs :', logger.warns().map(r => r.message).filter(m => !m.includes('storage')));

const repaired = object && object.name === 'Ana';
if (repaired && finishReason === 'length') {
  fail('a response cut off by the provider (finishReason="length") was silently repaired into a "valid" object; the caller gets a complete-looking result with no error and no warning.');
} else {
  pass('truncation was surfaced.');
}

// ---- Variant: the repaired object fails validation -> error is indistinguishable from bad JSON ----
console.log('\n===== variant: truncation lands before a REQUIRED field =====');
const strictSchema = z.object({ name: z.string(), total: z.number() });
const model2 = createFakeModel({
  modelId: 'truncating-2',
  script: [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: '{"name":"Ana","tot' },
    { type: 'text-end', id: '1' },
    { type: 'finish', finishReason: 'length', usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
  ],
});
const logger2 = createCapturingLogger();
const agent2 = new Agent({ name: 'a4b', instructions: 'Extract.', model: model2, logger: logger2 });
const mastra2 = new Mastra({ agents: { a4b: agent2 }, logger: logger2, telemetry: { enabled: false } });
try {
  const r2 = await mastra2.getAgent('a4b').stream('...', { structuredOutput: { schema: strictSchema } });
  await r2.text;
  const o2 = await r2.object;
  console.log('variant result.object      =', JSON.stringify(o2));
  console.log('variant result.finishReason=', JSON.stringify(await r2.finishReason));
} catch (e) {
  console.log('variant threw:', e?.constructor?.name, '-', e?.message);
  console.log('variant error carries finishReason/truncation info:',
    JSON.stringify({ finishReason: e?.finishReason, details: e?.details, cause: e?.cause?.message }));
}
console.log('variant error-level logs:', logger2.errors().map(r => r.message));
