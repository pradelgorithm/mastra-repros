// A7 — An output-processor tripwire blanks `result.text` to "" for the whole run, while
// `result.steps[].text` and `result.response.messages` still carry the full assistant prose.
// The caller's headline field and the persisted conversation disagree, so a caller that
// logs/redacts/audits from `result.text` sees nothing while the message store keeps the text.
//
// It is also inconsistent across the three tripwire hooks: the SAME abort() blanks text from
// processOutputResult but not from processOutputStep or processOutputStream.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const ANSWER = 'Entregamos en Piantini el viernes. Tarjeta o transferencia.';

async function run(hook) {
  const proc = { id: `tripwire-via-${hook}` };
  proc[hook] = async ({ abort, part }) => {
    if (hook === 'processOutputStream') {
      if (part?.type === 'finish') abort(`rejected at ${hook}`);
      return part;
    }
    abort(`rejected at ${hook}`);
  };

  const model = createFakeModel({ modelId: 'primary', script: textChunks(ANSWER) });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'a7', instructions: 'Answer briefly.', model, outputProcessors: [proc], logger });
  const mastra = new Mastra({ agents: { a7: agent }, logger, telemetry: { enabled: false } });

  const res = await mastra.getAgent('a7').stream('¿Entregan en Piantini?');
  const text = await res.text;
  const steps = await res.steps;
  const response = await res.response;
  let tripwire; try { tripwire = await res.tripwire; } catch {}

  const inMessages = JSON.stringify(response?.messages ?? []).includes(ANSWER);
  console.log(`--- tripwire raised from ${hook} ---`);
  console.log('  result.text                :', JSON.stringify(text));
  console.log('  result.steps[0].text       :', JSON.stringify(steps?.[0]?.text));
  console.log('  response.messages has prose:', inMessages);
  console.log('  result.tripwire            :', JSON.stringify(tripwire));
  console.log('  response.messages          :', JSON.stringify(response?.messages));
  console.log();
  return { hook, text, stepText: steps?.[0]?.text, inMessages };
}

console.log('model actually produced:', JSON.stringify(ANSWER), '\n');
const results = [];
for (const hook of ['processOutputResult', 'processOutputStep', 'processOutputStream']) {
  results.push(await run(hook));
}

const blanked = results.filter(r => r.text === '' && r.inMessages && r.stepText === ANSWER);
const notBlanked = results.filter(r => r.text === ANSWER);
console.log('hooks where result.text was blanked while the prose survived elsewhere:', blanked.map(r => r.hook).join(', ') || '(none)');
console.log('hooks where result.text kept the prose                                :', notBlanked.map(r => r.hook).join(', ') || '(none)');

if (blanked.length > 0) {
  fail(`a tripwire from ${blanked.map(r => r.hook).join(', ')} sets result.text to "" while result.steps[0].text and result.response.messages still hold the full answer (and the other ${notBlanked.length} hook(s) do not blank it at all).`);
} else {
  pass('result.text, steps[].text and response.messages agree under every tripwire hook.');
}
