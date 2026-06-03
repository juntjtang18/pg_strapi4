'use strict';

const {
  getLocaleQuery,
  requestSubscriptionService,
} = require('../../../utils/subscription-service-client');

module.exports = () => ({
  async getPlanCatalogV11({ locale }) {
    return requestSubscriptionService({
      method: 'GET',
      params: getLocaleQuery(locale),
      path: '/api/v1.1/plans',
    });
  },

  async getUserEntitlementsV11({ locale, userId }) {
    return requestSubscriptionService({
      method: 'GET',
      params: getLocaleQuery(locale),
      path: `/api/v1.1/users/${userId}/entitlements`,
    });
  },

  async verifyApplePurchaseV11({ body, locale, userId }) {
    const { strapiUserId: _legacyUserId, userId: _clientUserId, ...safeBody } = body || {};
    return requestSubscriptionService({
      data: {
        ...safeBody,
        userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1.1/purchases/apple/verify',
    });
  },

  async syncAppleSubscriptionsV11({ body, locale, userId }) {
    const { strapiUserId: _legacyUserId, userId: _clientUserId, ...safeBody } = body || {};
    return requestSubscriptionService({
      data: {
        ...safeBody,
        userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1.1/purchases/apple/sync',
    });
  },

  async verifyGooglePurchaseV11({ body, locale, userId }) {
    const { strapiUserId: _legacyUserId, userId: _clientUserId, ...safeBody } = body || {};
    return requestSubscriptionService({
      data: {
        ...safeBody,
        userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1.1/purchases/google/verify',
    });
  },

  async checkUsageV11({ body, userId }) {
    return requestSubscriptionService({
      data: body,
      method: 'POST',
      path: `/api/v1.1/users/${userId}/usage/check`,
    });
  },

  async consumeUsageV11({ body, userId }) {
    return requestSubscriptionService({
      data: body,
      method: 'POST',
      path: `/api/v1.1/users/${userId}/usage/consume`,
    });
  },
});
