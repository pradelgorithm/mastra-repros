// A second agent run nested under an existing span with `tracingOptions: { traceId, parentSpanId }`
// (e.g. an LLM judge scoring the turn that just ran) is exported by @mastra/langfuse with trace-level
// `langfuse.trace.input`, `langfuse.trace.output`, `langfuse.trace.name` and `langfuse.trace.metadata.*`,
// although the same span is exported as a CHILD of the outer run. Langfuse applies `langfuse.trace.*`
// from any span, so the judge replaces the outer trace's input/output/name.
import { Agent } from '@mastra/core/agent';
import { captureLangfuse, mastraWithLangfuse, flush, createFakeModel } from './harness.mjs';

const spans = captureLangfuse();

const assistant = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'Answer the customer.',
  model: createFakeModel({ text: 'Your order ships Friday.' }),
});
const judge = new Agent({
  id: 'judge',
  name: 'judge',
  instructions: 'Grade the answer.',
  model: createFakeModel({ text: '{"score":1}' }),
});
const mastra = mastraWithLangfuse({ agents: { assistant, judge } });

// 1. The outer run: the customer's turn.
const turn = await mastra.getAgent('assistant').generate('When does my order ship?');
await flush(mastra);
const outerRoot = spans.find(
  s => s.spanContext().traceId === turn.traceId && s.attributes['mastra.span.type'] === 'agent_run',
);
const outerSpanId = outerRoot.spanContext().spanId;

// 2. The nested run: a judge, parented under the turn's agent_run span.
await mastra.getAgent('judge').generate('Grade: "Your order ships Friday."', {
  tracingOptions: { traceId: turn.traceId, parentSpanId: outerSpanId },
});
await flush(mastra);

const agentRuns = spans.filter(s => s.attributes['mastra.span.type'] === 'agent_run');
const pick = s => ({
  traceId: s.spanContext().traceId,
  spanId: s.spanContext().spanId,
  'OTel parent span id': s.parentSpanContext?.spanId ?? '(none — true root)',
  'langfuse.trace.name': s.attributes['langfuse.trace.name'],
  'langfuse.trace.input': s.attributes['langfuse.trace.input'],
  'langfuse.trace.output': s.attributes['langfuse.trace.output'],
  'langfuse.trace.metadata.agentId': s.attributes['langfuse.trace.metadata.agentId'],
  'langfuse.trace.metadata.runId': s.attributes['langfuse.trace.metadata.runId'],
});

for (const s of agentRuns) {
  console.log(`\nagent_run span "${s.name}" (export order #${spans.indexOf(s) + 1} of ${spans.length}):`);
  console.log(pick(s));
}

const judgeRoot = agentRuns.find(s => s.attributes['gen_ai.agent.id'] === 'judge');
const nestedUnderOuter =
  judgeRoot.spanContext().traceId === turn.traceId && judgeRoot.parentSpanContext?.spanId === outerSpanId;
const writesTraceFields = ['langfuse.trace.input', 'langfuse.trace.output', 'langfuse.trace.name'].filter(
  k => judgeRoot.attributes[k] !== undefined,
);

if (nestedUnderOuter && writesTraceFields.length > 0) {
  console.error(
    `\nREPRODUCED: the judge's agent_run is exported as a child of the turn's span (same traceId, OTel parent = ${outerSpanId}), ` +
      `yet it carries ${writesTraceFields.join(', ')}. It is exported after the turn, so in Langfuse the trace's ` +
      `name/input/output become the judge's.`,
  );
  process.exitCode = 1;
} else {
  console.log('\nNOT REPRODUCED: the nested run does not write trace-level fields.');
}
