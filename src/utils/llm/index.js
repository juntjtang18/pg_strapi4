'use strict';

const { createOpenAiAdapter } = require('./openai-adapter');

function createLlm({ apiKey, model } = {}) {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
  return createOpenAiAdapter({
    apiKey: apiKey || process.env.OPENAI_API_KEY,
    model: model || process.env.OPENAI_TRANSLATE_MODEL,
  });
}

module.exports = {
  createLlm,
};
