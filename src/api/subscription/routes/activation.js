// File: src/api/subscription/routes/activation.js
'use strict';

/**
 * Custom route for activating a subscription.
 */
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/v1/subscriptions/activate',
      handler: 'subscription.activate',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/subscriptions/my-active-plan',
      handler: 'subscription.myActivePlan',
      config: {
        auth: false, // The controller handles authentication manually
        policies: [],
      },
    },
  ],
};