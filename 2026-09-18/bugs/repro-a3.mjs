// A3 — A model chain that RECOVERS still logs at `error` level, twice, per failed model.
// Nothing distinguishes "a fallback took over and the run succeeded" from "the run failed":
// only "Exhausted all fallback models." is terminal, and it is logged at the same level.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createFakeModel, textChunks, createCapturingLogger, fail, pass } from './fake-model.mjs';

const failing = createFakeModel({
  modelId: 'flaky-primary',
  fail: () => Object.assign(new Error('simulated upstream 500'), { name: 'SimulatedUpstreamError' }),
});
const ok = createFakeModel({
  modelId: 'healthy-fallback',
  script: textChunks('Sí, entregamos en Piantini.'),
});

const logger = createCapturingLogger();
const agent = new Agent({
  name: 'a3',
  instructions: 'Answer in one short sentence.',
  model: [
    { model: failing, maxRetries: 0 },
    { model: ok, maxRetries: 0 },
  ],
  logger,
});
const mastra = new Mastra({ agents: { a3: agent }, logger, telemetry: { enabled: false } });

const res = await mastra.getAgent('a3').generate('¿Entregan en Piantini?');

console.log('result.text          =', JSON.stringify(res.text));
console.log('run outcome          =', res.text ? 'SUCCESS (the fallback answered)' : 'FAILED');
console.log('calls to flaky model =', failing.calls.length);
console.log('calls to fallback    =', ok.calls.length);

const errors = logger.errors();
const warns = logger.warns();
console.log('\nlog records at level=error :', errors.length);
errors.forEach((r, i) => console.log(`  [error ${i + 1}] ${r.message}`));
console.log('log records at level=warn  :', warns.length);
warns.forEach((r, i) => console.log(`  [warn ${i + 1}] ${r.message}`));

const terminal = errors.some(r => r.message.includes('Exhausted all fallback models'));
console.log('\nterminal "Exhausted all fallback models." logged:', terminal);

if (res.text && errors.length > 0 && !terminal) {
  fail(`the run SUCCEEDED via the fallback, yet ${errors.length} record(s) about the recovered attempt were logged at level=error, with no warn-level downgrade and no terminal marker.`);
} else {
  pass('a recovered failover does not log at error level.');
}
