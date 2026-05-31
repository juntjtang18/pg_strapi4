'use strict';

const axios = require('axios');
const { ApplicationError } = require('@strapi/utils').errors;
const {
  getLocaleQuery,
  requestSubscriptionService,
} = require('../../../utils/subscription-service-client');

module.exports = ({ strapi }) => ({
  async forwardActivationToSubsystem({ userId, receipt }) {
    // --- ADDED LOGGING HERE ---
    strapi.log.debug(`forwardActivationToSubsystem called with userId: ${userId}`);
    strapi.log.debug(`forwardActivationToSubsystem called with receipt: ${receipt}`);
    // --------------------------

    const subsystemUrl = process.env.SUBSYS_BASE_URL;
    const subsystemSecret = process.env.SUBSCRIPTION_SERVICE_SECRET;

    if (!subsystemUrl || !subsystemSecret) {
      strapi.log.error(
        'SUBSYS_BASE_URL or SUBSCRIPTION_SERVICE_SECRET environment variables are not set.'
      );
      throw new ApplicationError(
        'Server is not configured to handle subscriptions.'
      );
    }

    const endpoint = `${subsystemUrl}/api/v1/verify-apple-purchase`;
    strapi.log.info(`Forwarding activation for user ${userId} to subsystem: ${endpoint}`);

    try {
      // Adding the Authorization header with the secret to the subsystem request
      const response = await axios.post(
        endpoint,
        {
          receipt: receipt,
          userId: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${subsystemSecret}`,
          },
        }
      );
      return response.data;

    } catch (error) {
      if (error.response) {
        strapi.log.error(
          `[SUBSYSTEM ERROR] Status: ${error.response.status} | Data: ${JSON.stringify(
            error.response.data
          )}`
        );
      } else {
        strapi.log.error(`[SUBSYSTEM NETWORK ERROR] ${error.message}`);
      }
      throw error;
    }
  },

  async getPlanCatalogV11({ locale }) {
    return requestSubscriptionService({
      method: 'GET',
      params: getLocaleQuery(locale),
      path: '/api/v1/plans',
    });
  },

  async getUserEntitlementsV11({ locale, userId }) {
    return requestSubscriptionService({
      method: 'GET',
      params: getLocaleQuery(locale),
      path: `/api/v1/users/${userId}/entitlements`,
    });
  },

  async verifyApplePurchaseV11({ body, locale, userId }) {
    return requestSubscriptionService({
      data: {
        ...body,
        strapiUserId: userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1/purchases/apple/verify',
    });
  },

  async syncAppleSubscriptionsV11({ body, locale, userId }) {
    return requestSubscriptionService({
      data: {
        ...body,
        strapiUserId: userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1/purchases/apple/sync',
    });
  },

  async verifyGooglePurchaseV11({ body, locale, userId }) {
    return requestSubscriptionService({
      data: {
        ...body,
        strapiUserId: userId,
      },
      method: 'POST',
      params: getLocaleQuery(locale),
      path: '/api/v1/purchases/google/verify',
    });
  },

  async checkUsageV11({ body, userId }) {
    return requestSubscriptionService({
      data: body,
      method: 'POST',
      path: `/api/v1/users/${userId}/usage/check`,
    });
  },

  async consumeUsageV11({ body, userId }) {
    return requestSubscriptionService({
      data: body,
      method: 'POST',
      path: `/api/v1/users/${userId}/usage/consume`,
    });
  },
});
