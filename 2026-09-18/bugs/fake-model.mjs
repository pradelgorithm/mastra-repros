// A keyless LanguageModelV2 (AI SDK v5 spec) fake model.
// It records every call's options and replays a scripted list of stream chunks.

const DEFAULT_USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

export function textChunks(text, { id = '1', finishReason = 'stop', usage = DEFAULT_USAGE, pieces } = {}) {
  const parts = pieces ?? [text];
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id },
    ...parts.map(delta => ({ type: 'text-delta', id, delta })),
    { type: 'text-end', id },
    { type: 'finish', finishReason, usage },
  ];
}

export function toolCallChunks({ toolCallId = 'call-1', toolName, input = '{}', usage = DEFAULT_USAGE } = {}) {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId, toolName, input },
    { type: 'finish', finishReason: 'tool-calls', usage },
  ];
}

/**
 * @param {object} opts
 * @param {string} opts.modelId
 * @param {Array|Function} opts.script  chunks, or (options, callIndex) => chunks | Promise<chunks>
 * @param {Array} opts.scripts          per-call scripts (falls back to `script` when exhausted)
 * @param {Function} opts.fail          (options, callIndex) => Error|undefined ; throws instead of streaming
 * @param {number} opts.delayMs         await this long before emitting the `finish` chunk
 */
export function createFakeModel({
  modelId = 'fake-model',
  provider = 'fake',
  script,
  scripts,
  fail,
  delayMs = 0,
  chunkDelayMs = 0,
} = {}) {
  const calls = [];

  async function resolveChunks(options) {
    const i = calls.length - 1;
    if (fail) {
      const err = fail(options, i);
      if (err) throw err;
    }
    let s = scripts && i < scripts.length ? scripts[i] : script;
    if (typeof s === 'function') s = await s(options, i);
    return s ?? textChunks('default fake answer');
  }

  const model = {
    specificationVersion: 'v2',
    provider,
    modelId,
    supportedUrls: {},
    calls,

    async doGenerate(options) {
      calls.push(options);
      const chunks = await resolveChunks(options);
      const content = [];
      let finishReason = 'stop';
      let usage = DEFAULT_USAGE;
      let text = '';
      for (const c of chunks) {
        if (c.type === 'text-delta') text += c.delta;
        else if (c.type === 'tool-call') content.push({ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, input: c.input });
        else if (c.type === 'finish') { finishReason = c.finishReason; usage = c.usage ?? usage; }
      }
      if (text) content.unshift({ type: 'text', text });
      return { content, finishReason, usage, warnings: [], request: {}, response: { id: `fake-${calls.length}`, timestamp: new Date(0), modelId } };
    },

    async doStream(options) {
      calls.push(options);
      const chunks = await resolveChunks(options);
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const c of chunks) {
              if (c.type === 'finish' && delayMs) await new Promise(r => setTimeout(r, delayMs));
              else if (chunkDelayMs) await new Promise(r => setTimeout(r, chunkDelayMs));
              controller.enqueue(c);
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });
      return { stream, request: {}, response: { id: `fake-${calls.length}`, timestamp: new Date(0), modelId } };
    },
  };
  return model;
}

import { MastraLogger, LogLevel } from '@mastra/core/logger';

/** A real MastraLogger that keeps every record so levels can be asserted. */
export class CapturingLogger extends MastraLogger {
  constructor() {
    super({ name: 'capturing', level: LogLevel.DEBUG });
    this.records = [];
  }
  #push(level, message, args) { this.records.push({ level, message: String(message), args }); }
  debug(message, ...args) { this.#push('debug', message, args); }
  info(message, ...args) { this.#push('info', message, args); }
  warn(message, ...args) { this.#push('warn', message, args); }
  error(message, ...args) { this.#push('error', message, args); }
  trackException(e) { this.#push('error', e?.message ?? String(e), [e]); }
  errors() { return this.records.filter(r => r.level === 'error'); }
  warns() { return this.records.filter(r => r.level === 'warn'); }
  async getLogs() { return { logs: this.records, total: this.records.length, page: 0, perPage: 100, hasMore: false }; }
  async getLogsByRunId() { return { logs: this.records, total: this.records.length, page: 0, perPage: 100, hasMore: false }; }
}

export function createCapturingLogger() { return new CapturingLogger(); }

export function fail(msg) {
  console.error(`\nREPRODUCED: ${msg}`);
  process.exitCode = 1;
}
export function pass(msg) {
  console.log(`\nPASS (not reproduced): ${msg}`);
}
