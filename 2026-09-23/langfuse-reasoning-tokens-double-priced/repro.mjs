// @mastra/langfuse (via @mastra/otel-exporter) sends reasoning tokens as a SECOND usage bucket on top
// of an output_tokens count that already includes them, so Langfuse prices reasoning twice.
//
// The fake model reports the usage measured on a real gpt-6-luna generation:
//   input 39,056 · output 2,023 (of which reasoning 1,632) · total 41,079
import { Agent } from '@mastra/core/agent';
import { captureLangfuse, mastraWithLangfuse, flush, createFakeModel } from './harness.mjs';

const spans = captureLangfuse();

const usage = { inputTokens: 39_056, outputTokens: 2_023, reasoningTokens: 1_632, totalTokens: 41_079 };
const model = createFakeModel({ modelId: 'gpt-6-luna', provider: 'openai.responses', usage });
const agent = new Agent({ id: 'reasoner', name: 'reasoner', instructions: 'Be brief.', model });
const mastra = mastraWithLangfuse({ agents: { reasoner: agent } });

await mastra.getAgent('reasoner').generate('hi');
await flush(mastra);

console.log('Model reported (LanguageModelV2 usage):', usage);

const withUsage = spans.filter(s => Object.keys(s.attributes).some(k => k.startsWith('gen_ai.usage.')));
if (withUsage.length === 0) {
  console.log('\nNo span carried gen_ai.usage.* attributes — cannot evaluate.');
  process.exit(2);
}

let reproduced = false;
for (const span of withUsage) {
  const usageAttrs = Object.fromEntries(Object.entries(span.attributes).filter(([k]) => k.startsWith('gen_ai.usage.')));
  console.log(`\nSpan handed to LangfuseSpanProcessor: "${span.name}" (mastra.span.type=${span.attributes['mastra.span.type']})`);
  console.log('  gen_ai.usage.* attributes:', usageAttrs);
  console.log('  langfuse.observation.usage_details:', span.attributes['langfuse.observation.usage_details'] ?? '(not set)');

  // What Langfuse's OTLP ingestion derives from those attributes (port of its generic GenAI path, see below).
  const details = langfuseGenericUsageDetails(span.attributes);
  // With no explicit total, Langfuse's total is the sum of every usage bucket.
  const total = details.total ?? Object.entries(details).reduce((a, [k, v]) => (k === 'total' ? a : a + v), 0);
  console.log('  -> Langfuse usage_details:', details, ' total:', total);

  // Langfuse's managed price definition for gpt-6-luna (worker/src/constants/default-model-prices.json).
  const price = { input: 1e-7, output: 5e-7, reasoning_tokens: 5e-7, output_reasoning_tokens: 5e-7 };
  const cost = Object.entries(details).reduce((acc, [k, v]) => acc + v * (price[k] ?? 0), 0);
  const billed = usage.inputTokens * price.input + usage.outputTokens * price.output;
  console.log(`  -> Langfuse inferred cost: $${cost.toFixed(7)}   provider-billed cost: $${billed.toFixed(7)}   (+${(((cost - billed) / billed) * 100).toFixed(1)}%)`);

  if (total !== usage.totalTokens) reproduced = true;

  // Counterfactual: the same count under the OTel semconv name `gen_ai.usage.reasoning.output_tokens`
  // ("SHOULD be included in gen_ai.usage.output_tokens"), which Langfuse subtracts from output.
  if ('gen_ai.usage.reasoning_tokens' in span.attributes) {
    const specAttrs = { ...span.attributes };
    specAttrs['gen_ai.usage.reasoning.output_tokens'] = specAttrs['gen_ai.usage.reasoning_tokens'];
    delete specAttrs['gen_ai.usage.reasoning_tokens'];
    const specDetails = langfuseGenericUsageDetails(specAttrs);
    const specTotal = Object.values(specDetails).reduce((a, b) => a + b, 0);
    const specCost = Object.entries(specDetails).reduce((acc, [k, v]) => acc + v * (price[k] ?? 0), 0);
    console.log(
      '  (same span with gen_ai.usage.reasoning.output_tokens instead ->',
      specDetails,
      `total: ${specTotal}, cost: $${specCost.toFixed(7)})`,
    );
  }
}

if (reproduced) {
  console.error(
    '\nREPRODUCED: output_tokens (2023) already includes the 1632 reasoning tokens, yet they are exported a second time as ' +
      'gen_ai.usage.reasoning_tokens. Langfuse keeps that key as its own bucket, so the generation totals 42,711 tokens ' +
      'instead of 41,079 and reasoning is priced twice.',
  );
  process.exitCode = 1;
} else {
  console.log('\nNOT REPRODUCED: Langfuse usage buckets add up to the provider total.');
}

/**
 * Port of Langfuse's `extractGenericGenAiUsageDetails` — the path used for any instrumentation scope that is not
 * one of Langfuse's special-cased SDKs (the scope here is "@mastra/langfuse"):
 * https://github.com/langfuse/langfuse/blob/b979116fdcc0151b923268956e02dd74cc2c8132/packages/shared/src/server/otel/OtelIngestionProcessor.ts#L3074-L3215
 * Only the spec-named reasoning keys (`gen_ai.usage.reasoning.output_tokens`, `completion_details.reasoning`) are
 * subtracted from `output`; any other `gen_ai.usage.*` key is kept as an additional bucket.
 */
function langfuseGenericUsageDetails(attributes) {
  const raw = {};
  for (const [key, value] of Object.entries(attributes)) {
    if ((key.startsWith('gen_ai.usage.') && key !== 'gen_ai.usage.cost') || key.startsWith('llm.token_count.')) {
      const n = Number(value);
      if (!Number.isNaN(n)) raw[key.replace('gen_ai.usage.', '').replace('llm.token_count.', '')] = n;
    }
  }
  const inputTokens = raw.prompt_tokens ?? raw.input_tokens ?? raw.prompt;
  const outputTokens = raw.completion_tokens ?? raw.output_tokens ?? raw.completion;
  const totalTokens = raw.total_tokens ?? raw.total;
  const cacheRead =
    raw['cache_read.input_tokens'] ?? raw.cache_read_input_tokens ?? raw.cache_read_tokens ??
    raw['details.cache_read_tokens'] ?? raw['details.cache_read_input_tokens'] ?? raw['prompt_details.cache_read'] ??
    raw.input_cached_tokens;
  const cacheCreation =
    raw['cache_creation.input_tokens'] ?? raw['cache_write.input_tokens'] ?? raw.cache_creation_input_tokens ??
    raw.cache_write_tokens ?? raw['details.cache_write_tokens'] ?? raw['details.cache_creation_input_tokens'] ??
    raw['prompt_details.cache_write'] ?? raw.input_cache_creation;
  const outputReasoning = raw['reasoning.output_tokens'] ?? raw['completion_details.reasoning'];
  const outputAudio = raw['completion_details.audio'];
  const consumed = new Set([
    'prompt_tokens', 'input_tokens', 'prompt', 'completion_tokens', 'output_tokens', 'completion', 'total_tokens', 'total',
    'cache_read.input_tokens', 'cache_read_input_tokens', 'cache_read_tokens', 'details.cache_read_tokens',
    'details.cache_read_input_tokens', 'prompt_details.cache_read', 'input_cached_tokens', 'cache_creation.input_tokens',
    'cache_write.input_tokens', 'cache_creation_input_tokens', 'cache_write_tokens', 'details.cache_write_tokens',
    'details.cache_creation_input_tokens', 'prompt_details.cache_write', 'input_cache_creation',
    'reasoning.output_tokens', 'completion_details.reasoning', 'completion_details.audio',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (!consumed.has(k)) out[k.startsWith('details.') ? k.slice(8) : k] = v;
  if (inputTokens !== undefined) out.input = Math.max(inputTokens - (cacheRead ?? 0) - (cacheCreation ?? 0), 0);
  if (outputTokens !== undefined) out.output = Math.max(outputTokens - (outputReasoning ?? 0) - (outputAudio ?? 0), 0);
  if (totalTokens !== undefined) out.total = totalTokens;
  if (cacheRead !== undefined) out.input_cached_tokens = cacheRead;
  if (cacheCreation !== undefined) out.input_cache_creation = cacheCreation;
  if (outputReasoning !== undefined) out.output_reasoning_tokens = outputReasoning;
  if (outputAudio !== undefined) out.output_audio_tokens = outputAudio;
  return out;
}
