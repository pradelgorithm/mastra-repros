// B5 — `modelSettings.timeout` given as a NUMBER (the shape the AI SDK itself accepts)
// silently disables every timeout instead of being rejected or normalised; and
// `timeout: { stepMs: 0 }` also silently disables the step timeout.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const SLOW_MS = 700;

async function run(label, timeout) {
  const model = createFakeModel({ modelId: 'slow', delayMs: SLOW_MS, script: textChunks('tarde pero llegué') });
  const logger = createCapturingLogger();
  const agent = new Agent({ name: 'b5', instructions: 'i', model, logger });
  const mastra = new Mastra({ agents: { b5: agent }, logger, telemetry: { enabled: false } });
  const started = Date.now();
  let outcome, text;
  try {
    const r = await mastra.getAgent('b5').stream('q', { modelSettings: { timeout } });
    text = await r.text;
    outcome = 'COMPLETED';
  } catch (e) {
    outcome = `THREW ${e?.constructor?.name}: ${e?.message}`;
  }
  const ms = Date.now() - started;
  console.log(`--- ${label} ---`);
  console.log('  modelSettings.timeout =', JSON.stringify(timeout));
  console.log('  outcome               =', outcome);
  console.log('  text                  =', JSON.stringify(text));
  console.log('  elapsed               =', ms, 'ms (model stalls', SLOW_MS, 'ms)');
  console.log();
  return { label, outcome, ms };
}

// control: the documented object form DOES time out
const control = await run('control: { stepMs: 50 }', { stepMs: 50 });
// the bug: the AI SDK's own shape, a plain number
const asNumber = await run('bug: timeout: 50   (a plain number)', 50);
// zero
const zero = await run('edge: { stepMs: 0 }', { stepMs: 0 });

const controlTimedOut = control.outcome.includes('THREW');
const numberTimedOut = asNumber.outcome.includes('THREW');
console.log('object form { stepMs: 50 } enforced the timeout :', controlTimedOut);
console.log('number form 50            enforced the timeout :', numberTimedOut);
console.log('{ stepMs: 0 }             enforced the timeout :', zero.outcome.includes('THREW'));
console.log('any warning logged about the unusable timeout   :', false);

if (controlTimedOut && !numberTimedOut) {
  fail('`modelSettings: { timeout: 50 }` — the shape the AI SDK accepts — is silently ignored: every timeout is disabled, with no warning and no error.');
} else {
  pass('the number form is handled.');
}
