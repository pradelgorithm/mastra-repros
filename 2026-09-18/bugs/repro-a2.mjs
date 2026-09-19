// A2 — `structuredOutput.jsonPromptInjection: false` is a no-op once `structuredOutput.model`
// is set. The full JSON schema plus a "Your response will be processed by another agent..."
// preamble is prepended to the leading system message on EVERY step.
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { createFakeModel, textChunks, toolCallChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({
  customerName: z.string(),
  deliveryDistrict: z.string(),
  boxCount: z.number(),
});

const lookup = createTool({
  id: 'lookup_zone',
  description: 'Look up a delivery zone.',
  inputSchema: z.object({ district: z.string() }),
  outputSchema: z.object({ covered: z.boolean() }),
  execute: async () => ({ covered: true }),
});

// step 1 -> tool call, step 2 -> text. Two steps, so we can see the injection on both.
const primary = createFakeModel({
  modelId: 'primary',
  scripts: [
    toolCallChunks({ toolName: 'lookup_zone', input: JSON.stringify({ district: 'Piantini' }) }),
    textChunks('Ana, Piantini, 2 boxes. Covered.'),
  ],
});
const structurer = createFakeModel({
  modelId: 'structurer',
  script: textChunks('{"customerName":"Ana","deliveryDistrict":"Piantini","boxCount":2}'),
});

const agent = new Agent({
  name: 'a2',
  instructions: 'You take orders. Be brief.',
  model: primary,
  tools: { lookup_zone: lookup },
  logger: createCapturingLogger(),
});

const res = await agent.stream('Ana, Piantini, 2 boxes', {
  structuredOutput: {
    schema,
    model: structurer,
    jsonPromptInjection: false, // <-- explicitly opted out
  },
  maxSteps: 3,
});
await res.text;
await res.object;

const PREAMBLE = 'Your response will be processed by another agent to extract structured data';
console.log('primary model calls (steps):', primary.calls.length);

let injectedSteps = 0;
primary.calls.forEach((call, i) => {
  const sys = call.prompt
    .filter(m => m.role === 'system')
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
  const injected = sys.includes(PREAMBLE);
  if (injected) injectedSteps++;
  console.log(`\n--- step ${i + 1} system message (verbatim) ---`);
  console.log(sys);
  console.log(`--- step ${i + 1}: preamble injected = ${injected}, schema fields present = ${Object.keys(schema.shape).every(k => sys.includes(k))} ---`);
});

// Secondary observation: `structuredOutput.instructions` is also dropped on this path.
const primary2 = createFakeModel({ modelId: 'primary2', script: textChunks('Ana, Piantini, 2 boxes.') });
const structurer2 = createFakeModel({ modelId: 'structurer2', script: textChunks('{"customerName":"Ana","deliveryDistrict":"Piantini","boxCount":2}') });
const agent2 = new Agent({ name: 'a2b', instructions: 'You take orders.', model: primary2, logger: createCapturingLogger() });
const r2 = await agent2.stream('Ana, Piantini, 2 boxes', {
  structuredOutput: { schema, model: structurer2, instructions: 'MARKER_CUSTOM_INSTRUCTIONS: use Spanish district names.' },
});
await r2.text; await r2.object;
const allPrompts2 = JSON.stringify(primary2.calls.map(c => c.prompt)) + JSON.stringify(structurer2.calls.map(c => c.prompt));
console.log(`\nstructuredOutput.instructions reached either model: ${allPrompts2.includes('MARKER_CUSTOM_INSTRUCTIONS')}`);

console.log(`\njsonPromptInjection: false  ->  injected on ${injectedSteps}/${primary.calls.length} steps`);
if (injectedSteps > 0) {
  fail(`jsonPromptInjection:false was ignored; the schema preamble was injected into ${injectedSteps} step(s).`);
} else {
  pass('jsonPromptInjection:false suppressed the injection.');
}
