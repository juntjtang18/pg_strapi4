// ./src/api/openai/routes/openai.js

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/openai/completion',
      handler: 'openai.getCompletion',
      config: {
        // Replace the old policy with your new custom policy
        policies: ['global::check-user-plan'],
      },
    },
  ],
};