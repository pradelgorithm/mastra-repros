// Keyless harness shared by the scripts in this folder.
//
// 1. `captureLangfuse()` patches `LangfuseSpanProcessor.prototype.onEnd` (from @langfuse/otel, the
//    processor @mastra/langfuse hands every converted span to) so each span is recorded in memory
//    instead of being sent over the network. What is recorded is exactly what Langfuse's OTLP
//    endpoint would receive: the OTel ReadableSpan after `SpanConverter.convertSpan()` and
//    `mapMastraToLangfuseAttributes()` ran.
// 2. `createFakeModel()` is a hand-written AI SDK `LanguageModelV2` (specificationVersion 'v2').
//    No API keys, no network calls.
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { Mastra } from '@mastra/core';
import { Observability } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';

export function captureLangfuse() {
  const spans = [];
  LangfuseSpanProcessor.prototype.onEnd = function onEnd(span) {
    spans.push(span);
  };
  LangfuseSpanProcessor.prototype.forceFlush = async function forceFlush() {};
  LangfuseSpanProcessor.prototype.shutdown = async function shutdown() {};
  return spans;
}

/** A Mastra instance whose only exporter is a real LangfuseExporter (dummy keys, never reaches the network). */
export function mastraWithLangfuse({ agents, exporterConfig = {} }) {
  return new Mastra({
    agents,
    logger: false,
    observability: new Observability({
      configs: {
        langfuse: {
          serviceName: 'mastra-repro',
          exporters: [
            new LangfuseExporter({
              publicKey: 'pk-lf-fake',
              secretKey: 'sk-lf-fake',
              baseUrl: 'http://127.0.0.1:9',
              ...exporterConfig,
            }),
          ],
        },
      },
    }),
  });
}

export async function flush(mastra) {
  // Span export is async (the exporter awaits SpanConverter init); give it a tick, then flush.
  await new Promise(r => setTimeout(r, 50));
  await mastra.observability?.getDefaultInstance?.()?.flush?.();
  await new Promise(r => setTimeout(r, 50));
}

/**
 * @param {object} o
 * @param {string} o.text                 assistant text
 * @param {object} o.usage                LanguageModelV2Usage
 * @param {object} [o.responseHeaders]    what a real provider returns as `response.headers`
 * @param {unknown} [o.responseBody]      what a real provider returns as `response.body` (doGenerate only)
 */
export function createFakeModel({
  modelId = 'fake-model',
  provider = 'fake',
  text = 'Hello from the fake model.',
  usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  responseHeaders,
  responseBody,
} = {}) {
  const calls = [];
  return {
    specificationVersion: 'v2',
    provider,
    modelId,
    supportedUrls: {},
    calls,
    async doGenerate(options) {
      calls.push({ method: 'doGenerate', options });
      return {
        content: [{ type: 'text', text }],
        finishReason: 'stop',
        usage,
        warnings: [],
        request: {},
        response: {
          id: `resp-${calls.length}`,
          timestamp: new Date(0),
          modelId,
          ...(responseHeaders ? { headers: responseHeaders } : {}),
          ...(responseBody !== undefined ? { body: responseBody } : {}),
        },
      };
    },
    async doStream(options) {
      calls.push({ method: 'doStream', options });
      const chunks = [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: `resp-${calls.length}`, timestamp: new Date(0), modelId },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: text },
        { type: 'text-end', id: 't1' },
        { type: 'finish', finishReason: 'stop', usage },
      ];
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      });
      return { stream, request: {}, response: responseHeaders ? { headers: responseHeaders } : {} };
    },
  };
}

export function attrsOf(span) {
  return span.attributes;
}

export function spanType(span) {
  return span.attributes['mastra.span.type'];
}
