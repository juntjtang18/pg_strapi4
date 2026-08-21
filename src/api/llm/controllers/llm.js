'use strict';

const {
  getAuthenticatedUserFromContext,
  isJwtError,
} = require('../../../utils/authenticated-user');

async function requireUser(ctx) {
  try {
    return await getAuthenticatedUserFromContext(ctx);
  } catch (error) {
    if (isJwtError(error)) {
      ctx.unauthorized('Invalid or expired token.');
      return null;
    }
    throw error;
  }
}

module.exports = {
  async complete(ctx) {
    const user = await requireUser(ctx);
    if (!user) return;

    const { system, messages, prompt, temperature, max_tokens: maxTokens, model } = ctx.request.body || {};
    try {
      const result = await strapi.service('api::llm.llm').complete({
        system,
        messages,
        prompt,
        temperature,
        maxTokens,
        model,
      });
      ctx.body = { data: result };
    } catch (error) {
      const status = error.status || error.response?.status || 500;
      strapi.log.error('LLM complete failed', {
        status,
        data: error.response?.data,
        message: error.message,
      });
      if (status === 400) return ctx.badRequest(error.message);
      return ctx.internalServerError('An error occurred while calling the LLM service.');
    }
  },

  async classifyPillar(ctx) {
    const user = await requireUser(ctx);
    if (!user) return;

    const { question, pillars } = ctx.request.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return ctx.badRequest('A "question" is required.');
    }
    if (!Array.isArray(pillars) || pillars.length === 0) {
      return ctx.badRequest('A non-empty "pillars" list is required.');
    }

    try {
      const result = await strapi.service('api::llm.llm').classifyPillar({ question, pillars });
      ctx.body = { data: result };
    } catch (error) {
      const status = error.status || error.response?.status || 500;
      strapi.log.error('LLM classify-pillar failed', {
        status,
        data: error.response?.data,
        message: error.message,
      });
      if (status === 400) return ctx.badRequest(error.message);
      return ctx.internalServerError('An error occurred while classifying the pillar.');
    }
  },
};
