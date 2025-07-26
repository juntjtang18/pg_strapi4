// File: src/api/subscription/services/subscription.js
'use strict';

const axios = require('axios');
const { ApplicationError } = require('@strapi/utils').errors;

module.exports = ({ strapi }) => ({
  async forwardActivationToSubsystem({ userId, receipt }) {
    // Reading the environment variables just like in your strapi-server.js
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
});