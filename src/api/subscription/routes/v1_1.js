'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/v1.1/subscription/plans',
      handler: 'subscription.plansV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/v1.1/subscription/me',
      handler: 'subscription.meV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/v1.1/subscription/apple/verify',
      handler: 'subscription.verifyAppleV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/v1.1/subscription/apple/sync',
      handler: 'subscription.syncAppleV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/v1.1/subscription/google/verify',
      handler: 'subscription.verifyGoogleV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/v1.1/subscription/usage/check',
      handler: 'subscription.checkUsageV11',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/v1.1/subscription/usage/consume',
      handler: 'subscription.consumeUsageV11',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
