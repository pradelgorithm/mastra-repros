// A1 — StructuredOutputProcessor.generateInstructions() promises a schema it never includes.
//
// The structuring agent's system prompt says "...valid JSON that matches the following
// schema:" and then jumps straight to "REQUIREMENTS:". The schema is never interpolated,
// so the structuring model is asked to match a schema it was never shown.
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({
  customerName: z.string(),
  deliveryDistrict: z.string(),
  boxCount: z.number(),
});

const primary = createFakeModel({
  modelId: 'primary',
  script: textChunks('Ana lives in Piantini and wants 2 boxes.'),
});
const structurer = createFakeModel({
  modelId: 'structurer',
  script: textChunks('{"customerName":"Ana","deliveryDistrict":"Piantini","boxCount":2}'),
});

const logger = createCapturingLogger();
const agent = new Agent({ name: 'a1', instructions: 'You take orders.', model: primary, logger });

const res = await agent.stream('Ana, Piantini, 2 boxes', {
  structuredOutput: { schema, model: structurer },
});
await res.text;
await res.object;

const structurerSystem = structurer.calls[0].prompt
  .filter(m => m.role === 'system')
  .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
  .join('\n---\n');

console.log('===== structuring model system prompt (verbatim) =====');
console.log(structurerSystem);
console.log('===== end =====\n');
console.log('(the structuring model DOES receive responseFormat.schema:',
  JSON.stringify(structurer.calls[0].responseFormat?.schema?.properties ?? null), ')\n');

const propertyNames = Object.keys(schema.shape);
const missing = propertyNames.filter(p => !structurerSystem.includes(p));
console.log('schema property names:', propertyNames.join(', '));
console.log('missing from the structuring prompt:', missing.join(', ') || '(none)');
console.log('prompt contains "matches the following schema:":', structurerSystem.includes('matches the following schema:'));
console.log('text immediately after that phrase:',
  JSON.stringify(structurerSystem.split('matches the following schema:')[1]?.slice(0, 40)));

if (missing.length === propertyNames.length && structurerSystem.includes('matches the following schema:')) {
  fail('the structuring prompt announces a schema and then includes none of its fields.');
} else {
  pass('the schema is present in the structuring prompt.');
}
