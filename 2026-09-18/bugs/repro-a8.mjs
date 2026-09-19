// A8 — When structured-output validation fails, what the caller can recover depends on the
// path, and on the processor path (structuredOutput.model set) the MastraError is flattened
// into a single tripwire string: the ZodError issues and the raw model value are both lost.
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const schema = z.object({
  customerName: z.string(),
  boxCount: z.number(),         // the model will omit this
});

function describe(label, e) {
  console.log(`  ${label} error class     :`, e?.constructor?.name);
  console.log(`  ${label} .message        :`, JSON.stringify(e?.message));
  console.log(`  ${label} .id             :`, JSON.stringify(e?.id));
  console.log(`  ${label} .details        :`, JSON.stringify(e?.details));
  console.log(`  ${label} .cause?.message :`, JSON.stringify(e?.cause?.message)?.slice(0, 300));
}

// ---------- 1. DIRECT path: no structuring model ----------
console.log('=== 1. direct path (structuredOutput.schema only) — invalid object ===');
{
  const model = createFakeModel({ modelId: 'direct', script: textChunks('{"customerName":"Ana"}') });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'd', instructions: 'i', model, logger });
  const mastra = new Mastra({ agents: { d: agent }, logger, telemetry: { enabled: false } });
  try {
    const r = await mastra.getAgent('d').stream('q', { structuredOutput: { schema, errorStrategy: 'strict' } });
    await r.text;
    console.log('  object =', JSON.stringify(await r.object));
  } catch (e) {
    describe('direct', e);
    console.log('  -> raw model text recoverable from the error:',
      JSON.stringify(e?.details?.value ?? null), '(this is the PARSED value, the raw text is not attached)');
  }
}

// ---------- 2. DIRECT path: unparseable output ----------
console.log('\n=== 2. direct path — output is not JSON at all ===');
{
  const model = createFakeModel({ modelId: 'direct2', script: textChunks('Lo siento, no puedo ayudarte con eso.') });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'd2', instructions: 'i', model, logger });
  const mastra = new Mastra({ agents: { d2: agent }, logger, telemetry: { enabled: false } });
  try {
    const r = await mastra.getAgent('d2').stream('q', { structuredOutput: { schema, errorStrategy: 'strict' } });
    await r.text;
    console.log('  object =', JSON.stringify(await r.object));
  } catch (e) {
    describe('parse', e);
    console.log('  -> the text the model actually returned is NOT attached anywhere on the error');
  }
}

// ---------- 3. PROCESSOR path: structuring model returns an invalid object ----------
console.log('\n=== 3. processor path (structuredOutput.model set) — invalid object, errorStrategy:"strict" ===');
{
  const primary = createFakeModel({ modelId: 'primary', script: textChunks('Ana quiere unas cajas.') });
  const structurer = createFakeModel({ modelId: 'structurer', script: textChunks('{"customerName":"Ana"}') });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'p', instructions: 'i', model: primary, logger });
  const mastra = new Mastra({ agents: { p: agent }, logger, telemetry: { enabled: false } });
  let thrown, res;
  try {
    res = await mastra.getAgent('p').stream('q', {
      structuredOutput: { schema, model: structurer, errorStrategy: 'strict' },
      maxSteps: 2,
    });
    await res.text;
    console.log('  object   =', JSON.stringify(await res.object));
    let tw; try { tw = await res.tripwire; } catch {}
    console.log('  tripwire =', JSON.stringify(tw, null, 2));
    console.log('  tripwire.reason typeof =', typeof tw?.reason);
    console.log('  tripwire carries ZodError issues:', JSON.stringify(tw ?? {}).includes('invalid_type'));
    console.log('  tripwire carries the raw structurer value:', JSON.stringify(tw ?? {}).includes('customerName'));
    console.log('  error-level logs:', logger.errors().map(r => r.message));
    console.log('  logged args are Error objects (not reachable by the caller):',
      logger.errors().map(r => r.args?.[0]?.constructor?.name));

    const flattened = typeof tw?.reason === 'string'
      && !JSON.stringify(tw).includes('invalid_type');
    if (flattened) {
      fail('on the processor path the MastraError is flattened into a tripwire string: the caller gets no ZodError issues, no details.value, and no raw structurer output.');
    } else {
      pass('the structured-output failure is recoverable on the processor path.');
    }
  } catch (e) {
    thrown = e;
    describe('processor', e);
    fail('processor path threw: ' + e?.message);
  }
}
