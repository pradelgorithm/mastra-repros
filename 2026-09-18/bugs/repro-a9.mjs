// A9 — When the caller's abortSignal fires while the structuring model is still streaming,
// StructuredOutputProcessor keeps writing to a controller whose stream is already closed:
// `TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed`, swallowed by
// handleError and logged as "[StructuredOutputProcessor] Structured output processing failed".
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({ customerName: z.string(), boxCount: z.number() });

const primary = createFakeModel({ modelId: 'primary', script: textChunks('Ana quiere 2 cajas.') });
// The structurer streams slowly, so the abort lands in the middle of it.
const structurer = createFakeModel({
  modelId: 'structurer',
  chunkDelayMs: 120,
  script: textChunks('{"customerName":"Ana","boxCount":2}', {
    pieces: ['{"customerName":', '"Ana",', '"boxCount":', '2}'],
  }),
});

const logger = createCapturingLogger();
const agent = new Agent({ name: 'a9', instructions: 'Answer briefly.', model: primary, logger });
const mastra = new Mastra({ agents: { a9: agent }, logger, telemetry: { enabled: false } });

const controller = new AbortController();
setTimeout(() => controller.abort(new Error('caller went away')), 260);

let finishReason, text, object, thrown;
try {
  const res = await mastra.getAgent('a9').stream('Ana, 2 cajas', {
    structuredOutput: { schema, model: structurer },
    abortSignal: controller.signal,
  });
  text = await res.text;
  try { object = await res.object; } catch (e) { object = `<threw: ${e?.message}>`; }
  try { finishReason = await res.finishReason; } catch (e) { finishReason = `<threw: ${e?.message}>`; }
} catch (e) {
  thrown = e;
}

await new Promise(r => setTimeout(r, 400)); // let the orphaned structuring stream finish

console.log('caller aborted mid-structuring.');
console.log('thrown            :', thrown ? `${thrown.constructor?.name}: ${thrown.message}` : '(nothing)');
console.log('result.text       :', JSON.stringify(text));
console.log('result.object     :', JSON.stringify(object));
console.log('result.finishReason:', JSON.stringify(finishReason));

const all = logger.records;
console.log('\nall log records:');
all.filter(r => r.level === 'error' || r.level === 'warn')
   .forEach(r => console.log(`  [${r.level}] ${r.message}`));

const invalidState = all.filter(r =>
  JSON.stringify([r.message, r.args?.map(a => a?.message ?? String(a))]).includes('ERR_INVALID_STATE') ||
  JSON.stringify([r.message, r.args?.map(a => a?.message ?? String(a))]).includes('Invalid state'));

console.log('\nrecords mentioning ERR_INVALID_STATE / "Invalid state":', invalidState.length);
invalidState.forEach(r => console.log(`  [${r.level}] ${r.message} :: ${r.args?.map(a => a?.message ?? String(a)).join(' | ')}`));

if (invalidState.length > 0) {
  fail('an aborted run leaves StructuredOutputProcessor enqueuing into a closed controller (ERR_INVALID_STATE), reported as "Structured output processing failed" rather than as the abort it was.');
} else {
  pass('no ERR_INVALID_STATE after an abort mid-structuring.');
}
