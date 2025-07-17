'use strict';

const axios = require('axios');

/**
 * A custom controller for the 'plan' API.
 * This version contains all logic directly within the controller to ensure reliability.
 */
module.exports = {
  /**
   * An action that handles the GET /api/plans request.
   * @param {object} ctx - The Koa context object.
   */
  async find(ctx) {
    try {
      // The logic to fetch plans is now directly inside the controller.
      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

      // Ensure that the necessary environment variables are configured.
      if (!subscriptionUrl || !secret) {
        // Use the global strapi.log for logging errors on the server.
        strapi.log.error("Subscription environment variables (SUBSYS_BASE_URL, SUBSCRIPTION_SERVICE_SECRET) are not set.");
        // Return a clear error to the client.
        return ctx.internalServerError("Subscription service is not configured on the server.");
      }

      // Make the GET request to the external subscription service.
      const response = await axios.get(`${subscriptionUrl}/api/v1/all-plans`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
      });
      
      // Set the response body directly with the data from the external service.
      ctx.body = response.data;

    } catch (err) {
      // Log the detailed error for debugging purposes.
      strapi.log.error('Error fetching plans in plan controller:', err);
      // Send a standardized 500 Internal Server Error response.
      ctx.internalServerError('An error occurred while fetching the plans.', { moreDetails: err.message });
    }
  }
};
