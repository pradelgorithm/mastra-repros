import { ModelRouterLanguageModel } from '@mastra/core/llm';
delete process.env.OPENAI_API_KEY;
const m = new ModelRouterLanguageModel({ id: 'openai/gpt-4o' });
const urls = await m.supportedUrls;
console.log('supportedUrls =', JSON.stringify(urls));
