// File: src/api/subscription/controllers/subscription.js

'use strict';
const {
  getAuthenticatedUserFromContext,
  isJwtError,
} = require('../../../utils/authenticated-user');
const {
  sendSubscriptionServiceError,
} = require('../../../utils/subscription-service-client');

async function withAuthenticatedUser(ctx, action) {
  try {
    const user = await getAuthenticatedUserFromContext(ctx);
    if (!user) return undefined;
    return await action(user);
  } catch (error) {
    if (isJwtError(error)) {
      return ctx.unauthorized('Invalid or expired token.');
    }

    return sendSubscriptionServiceError(
      ctx,
      error,
      'An error occurred while proxying the subscription request.'
    );
  }
}

module.exports = {
  async activate(ctx) {
    return sendDeprecatedSubscriptionEndpoint(ctx);
  },

  async myActivePlan(ctx) {
    return sendDeprecatedSubscriptionEndpoint(ctx);
  },

  async plansV11(ctx) {
    try {
      const result = await strapi.service('api::subscription.subscription').getPlanCatalogV11({
        locale: ctx.query?.locale,
      });

      return ctx.send(result);
    } catch (error) {
      return sendSubscriptionServiceError(
        ctx,
        error,
        'An error occurred while fetching subscription plans.'
      );
    }
  },

  async meV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').getUserEntitlementsV11({
        locale: ctx.query?.locale,
        userId: user.id,
      });

      return ctx.send(result);
    });
  },

  async verifyAppleV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').verifyApplePurchaseV11({
        body: ctx.request.body || {},
        locale: ctx.query?.locale,
        userId: user.id,
      });

      return ctx.send(result);
    });
  },

  async syncAppleV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').syncAppleSubscriptionsV11({
        body: ctx.request.body || {},
        locale: ctx.query?.locale,
        userId: user.id,
      });

      return ctx.send(result);
    });
  },

  async verifyGoogleV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').verifyGooglePurchaseV11({
        body: ctx.request.body || {},
        locale: ctx.query?.locale,
        userId: user.id,
      });

      return ctx.send(result);
    });
  },

  async checkUsageV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').checkUsageV11({
        body: ctx.request.body || {},
        userId: user.id,
      });

      return ctx.send(result);
    });
  },

  async consumeUsageV11(ctx) {
    return withAuthenticatedUser(ctx, async (user) => {
      const result = await strapi.service('api::subscription.subscription').consumeUsageV11({
        body: ctx.request.body || {},
        userId: user.id,
      });

      return ctx.send(result);
    });
  },
};

function sendDeprecatedSubscriptionEndpoint(ctx) {
  const body = {
    error: 'Gone',
    message: 'This subscription endpoint is deprecated. Use /api/v1.1/subscription endpoints.',
  };

  if (typeof ctx.send === 'function') {
    return ctx.send(body, 410);
  }

  ctx.status = 410;
  ctx.body = body;
  return body;
}
