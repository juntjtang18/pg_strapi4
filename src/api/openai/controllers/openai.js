// ./src/api/openai/controllers/openai.js

'use strict';
const axios = require('axios');

module.exports = {
  async getCompletion(ctx) {
    if (!ctx.state.user) {
      return ctx.unauthorized('You must be logged in to perform this action.');
    }

    const { prompt } = ctx.request.body;

    if (!prompt) {
      return ctx.badRequest('A "prompt" is required in the request body.');
    }

    // 1. Create the new, enhanced prompt.
    // This adds your guideline to the user's original question.
    const enhancedPrompt = `Answer the question in less than 160 words. Question: "${prompt}"`;

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: enhancedPrompt }],
        
        // 2. Set the max_tokens to 400 as a hard limit/safety net.
        max_tokens: 400, 

        // Other parameters remain for fine-tuning the response quality.
        temperature: 0.7, 
        top_p: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
        stop: null 

      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        }
      });

      ctx.send(response.data);

    } catch (error) {
      console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
      return ctx.internalServerError('An error occurred while communicating with the AI service.');
    }
  }
};