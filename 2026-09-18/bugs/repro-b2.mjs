// B2 — Does buildStructuringPrompt ever hand the structuring model an EMPTY prompt?
// It collects only text-delta / reasoning-delta / tool-call / tool-result chunks, so the
// question is whether the non-streaming generate() path produces those chunks at all.
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({ customerName: z.string(), boxCount: z.number() });
const PRIMARY_TEXT = 'Ana quiere 2 cajas para el viernes.';

async function probe(method) {
  const primary = createFakeModel({ modelId: 'primary', script: textChunks(PRIMARY_TEXT) });
  const structurer = createFakeModel({ modelId: 'structurer', script: textChunks('{"customerName":"Ana","boxCount":2}') });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'b2', instructions: 'Take the order.', model: primary, logger });
  const mastra = new Mastra({ agents: { b2: agent }, logger, telemetry: { enabled: false } });
  const a = mastra.getAgent('b2');

  let object;
  if (method === 'generate') {
    const r = await a.generate('Ana, 2 cajas', { structuredOutput: { schema, model: structurer } });
    object = r.object;
  } else {
    const r = await a.stream('Ana, 2 cajas', { structuredOutput: { schema, model: structurer } });
    await r.text;
    object = await r.object;
  }

  const userPrompt = JSON.stringify(structurer.calls[0]?.prompt?.filter(m => m.role !== 'system') ?? []);
  console.log(`--- ${method}() ---`);
  console.log('  structurer was called       :', structurer.calls.length, 'time(s)');
  console.log('  structurer user prompt      :', userPrompt);
  console.log('  contains the primary text   :', userPrompt.includes(PRIMARY_TEXT));
  console.log('  result.object               :', JSON.stringify(object));
  console.log();
  return { method, called: structurer.calls.length, hasText: userPrompt.includes(PRIMARY_TEXT) };
}

const results = [await probe('stream'), await probe('generate')];
const broken = results.filter(r => r.called > 0 && !r.hasText);
if (broken.length > 0) {
  fail(`the structuring model received a prompt WITHOUT the primary model's text on: ${broken.map(r => r.method).join(', ')}`);
} else {
  pass('both stream() and generate() hand the structuring model the primary text; buildStructuringPrompt is never empty here.');
}
