'use strict';

const axios = require('axios');

const DEFAULT_MODEL = 'gpt-3.5-turbo';
const MODEL_ALLOW = new Set(['gpt-3.5-turbo', 'gpt-4o-mini']);
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function resolveModel(model) {
  return MODEL_ALLOW.has(model) ? model : DEFAULT_MODEL;
}

function buildMessages({ system, messages, prompt }) {
  const out = [];
  if (system && String(system).trim()) {
    out.push({ role: 'system', content: String(system).trim() });
  }
  if (Array.isArray(messages) && messages.length) {
    for (const message of messages) {
      if (!message || !message.role || message.content == null) continue;
      out.push({
        role: String(message.role),
        content: String(message.content),
      });
    }
  } else if (prompt && String(prompt).trim()) {
    out.push({ role: 'user', content: String(prompt).trim() });
  }
  return out;
}

/**
 * Thin OpenAI chat adapter, same idea as aem_pro's model adapter:
 * complete({ system, messages }) -> { text, model, usage }.
 * No tools, memory, or agent loop.
 */
function createOpenAiAdapter({ apiKey, model } = {}) {
  const defaultModel = resolveModel(model);

  async function complete({
    system,
    messages,
    prompt,
    temperature = 0,
    maxTokens = 80,
    model: requestModel,
  } = {}) {
    if (!apiKey) {
      const error = new Error('OPENAI_API_KEY is not set.');
      error.status = 500;
      throw error;
    }

    const built = buildMessages({ system, messages, prompt });
    if (!built.some((item) => item.role === 'user')) {
      const error = new Error('A prompt or user message is required.');
      error.status = 400;
      throw error;
    }

    const modelToUse = resolveModel(requestModel || defaultModel);
    const response = await axios.post(
      OPENAI_URL,
      {
        model: modelToUse,
        messages: built,
        temperature: typeof temperature === 'number' ? temperature : 0,
        max_tokens: Math.max(8, Math.min(Number(maxTokens) || 80, 400)),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      text: response.data?.choices?.[0]?.message?.content?.trim() || '',
      model: modelToUse,
      usage: response.data?.usage || null,
    };
  }

  return {
    id: 'openai',
    complete,
  };
}

module.exports = {
  DEFAULT_MODEL,
  MODEL_ALLOW,
  buildMessages,
  createOpenAiAdapter,
  resolveModel,
};
