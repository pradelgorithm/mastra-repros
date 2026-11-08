// `excludeSpanTypes` and `spanFilter` both drop spans before export, but only `excludeSpanTypes` re-parents the
// dropped span's children (#20818, fixed by #20881). A span dropped by `spanFilter` is still the `parentSpanId` of
// every child that is exported, so exporters receive spans whose parent never arrives.
//
// A second symptom of the same cause: `spanFilter` runs again on every event of a span (started, updated, ended).
// A filter that reads end-time data, like the documented "only keep tool calls that failed" example, keeps the
// SPAN_STARTED event and drops the SPAN_ENDED event, so exporters receive a span that never ends.
//
// The span tree is the shape of one agent turn that calls a tool:
//   agent_run → model_generation → model_step → tool_call
import { SamplingStrategyType, SpanType, TracingEventType } from '@mastra/core/observability';
import { DefaultObservabilityInstance } from '@mastra/observability';

/** Records every tracing event the instance emits. */
class CaptureExporter {
  name = 'capture';
  events = [];
  async exportTracingEvent(event) {
    this.events.push(event);
  }
  async flush() {}
  async shutdown() {}
}

async function runTurn(label, filtering) {
  const exporter = new CaptureExporter();
  const tracing = new DefaultObservabilityInstance({
    serviceName: 'repro',
    name: label,
    sampling: { type: SamplingStrategyType.ALWAYS },
    exporters: [exporter],
    ...filtering,
  });

  const agent = tracing.startSpan({ type: SpanType.AGENT_RUN, name: 'agent run: support-agent' });
  const generation = agent.createChildSpan({
    type: SpanType.MODEL_GENERATION,
    name: 'llm: mock-model',
    attributes: { model: 'mock-model', provider: 'mock-provider' },
  });
  const step = generation.createChildSpan({ type: SpanType.MODEL_STEP, name: 'step: 0' });
  const tool = step.createChildSpan({
    type: SpanType.TOOL_CALL,
    name: "tool: 'lookup_order'",
    attributes: { toolId: 'lookup_order', toolType: 'function' },
  });

  tool.end({ attributes: { success: true } });
  step.end();
  generation.end();
  agent.end();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await tracing.shutdown?.();

  const ids = { [agent.id]: 'agent_run', [generation.id]: 'model_generation', [step.id]: 'model_step', [tool.id]: 'tool_call' };
  const exported = new Map();
  const started = new Set();
  const ended = new Set();
  for (const { type, exportedSpan } of exporter.events) {
    exported.set(exportedSpan.id, exportedSpan);
    if (type === TracingEventType.SPAN_STARTED) started.add(exportedSpan.id);
    if (type === TracingEventType.SPAN_ENDED) ended.add(exportedSpan.id);
  }
  const orphans = [...exported.values()].filter((s) => s.parentSpanId && !exported.has(s.parentSpanId));
  const neverEnded = [...started].filter((id) => !ended.has(id));

  console.log(`\n${label}`);
  for (const span of exported.values()) {
    const parent = span.parentSpanId ? ids[span.parentSpanId] ?? span.parentSpanId : '(root)';
    const arrived = !span.parentSpanId || exported.has(span.parentSpanId) ? '' : '   <- parent never exported';
    console.log(`  ${ids[span.id].padEnd(17)} parent: ${parent}${arrived}`);
  }
  console.log(`  orphans: ${orphans.map((s) => ids[s.id]).join(', ') || 'none'}`);
  console.log(`  started but never ended: ${neverEnded.map((id) => ids[id]).join(', ') || 'none'}`);
  return { orphans: orphans.length, neverEnded: neverEnded.length };
}

const exclude = await runTurn('A. excludeSpanTypes: [MODEL_STEP]', {
  excludeSpanTypes: [SpanType.MODEL_STEP],
});
const filtered = await runTurn('B. spanFilter: span => span.type !== MODEL_STEP', {
  spanFilter: (span) => span.type !== SpanType.MODEL_STEP,
});
const documented = await runTurn('C. spanFilter from the config docs: "only keep tool calls that failed"', {
  spanFilter: (span) => !(span.type === SpanType.TOOL_CALL && span.attributes?.success),
});

const reproduced = exclude.orphans === 0 && (filtered.orphans > 0 || documented.neverEnded > 0);
console.log(`\n${reproduced ? 'REPRODUCED' : 'NOT REPRODUCED'}: excludeSpanTypes orphans ${exclude.orphans}, spanFilter orphans ${filtered.orphans}, spans started but never ended ${documented.neverEnded}`);
process.exit(reproduced ? 1 : 0);
