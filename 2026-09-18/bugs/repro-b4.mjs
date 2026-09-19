// B4 — REPORT ONLY (not filed): wrapping a ModelRouterLanguageModel in `new Proxy(model, {})`
// breaks, because `_getStreamTransport()` reads the ECMAScript private field
// `#lastStreamTransport`, which a Proxy cannot forward. This is a JS-language restriction,
// not a Mastra defect; it is recorded here only as a documentation gap.
import { Agent } from '@mastra/core/agent';

const agent = new Agent({ name: 'b4', instructions: 'i', model: 'openai/gpt-4o-mini' });
const model = await agent.getModel(); // resolves with no API key

console.log('resolved model class     :', model?.constructor?.name);
console.log('specificationVersion     :', model?.specificationVersion);
console.log('has _getStreamTransport  :', typeof model._getStreamTransport);
console.log('direct call              :', model._getStreamTransport());

const proxied = new Proxy(model, {});
try {
  proxied._getStreamTransport();
  console.log('proxied call             : ok');
} catch (e) {
  console.log('proxied call             : THREW', e.constructor.name, '-', e.message);
}
console.log('\nagent-CAD1joQX.js:26525 calls routerModel._getStreamTransport() during a run,');
console.log('so a Proxy-wrapped router model throws there. Verdict: expected JS behaviour;');
console.log('use AI SDK wrapLanguageModel (or a subclass) instead of a bare Proxy. NOT FILED.');
