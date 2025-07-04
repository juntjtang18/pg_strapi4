// ./src/api/openai/controllers/openai.js

'use strict';
const axios = require('axios');

module.exports = {
  /**
   * A custom controller action to bridge requests to the OpenAI API.
   */
  async getCompletion(ctx) {
    // Ensure the user is authenticated. The route policy will handle this,
    // but it's good practice to check for the user state.
    if (!ctx.state.user) {
      return ctx.unauthorized('You must be logged in to perform this action.');
    }

    // The user's prompt and other data will be in the request body.
    const { prompt } = ctx.request.body;

    if (!prompt) {
      return ctx.badRequest('A "prompt" is required in the request body.');
    }

    try {
      // Make the API call to OpenAI
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo", // Or any other model you prefer
        messages: [{ role: "user", content: prompt }],
        // You can add other parameters here, like max_tokens, temperature, etc.
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        }
      });

      // Send the response from OpenAI back to the client
      ctx.send(response.data);

    } catch (error) {
      // Log the detailed error and return a generic message
      console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
      return ctx.internalServerError('An error occurred while communicating with the AI service.');
    }
  }
};