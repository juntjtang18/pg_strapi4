// File: src/api/subscription/controllers/subscription.js

'use strict';
const axios = require('axios');

module.exports = {
  async activate(ctx) {
    let user; 

    try {
      // Manual Authentication
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi.plugin('users-permissions').service('jwt').verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token: User ID not found.');
      }
      user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
      if (!user) {
        return ctx.unauthorized('User not found for this token.');
      }

      const { apple_receipt } = ctx.request.body;

      if (!apple_receipt) {
        return ctx.badRequest('The "apple_receipt" is required.');
      }

      // --- ADDED LOGGING HERE ---
      console.log(`[DEBUG] Preparing to call forwardActivationToSubsystem. UserID: ${user.id}, Receipt: ${apple_receipt}`);
      // --------------------------

      const resultFromSubsystem = await strapi
        .service('api::subscription.subscription')
        .forwardActivationToSubsystem({
          userId: user.id,
          receipt: apple_receipt,
        });

      return ctx.send(resultFromSubsystem);

    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      
      const userIdLog = user ? `for user ${user.id}` : '';
      strapi.log.error(`Subsystem Activation Error ${userIdLog}: ${error.message}`);
      
      if (error.isAxiosError && error.response) {
        return ctx.send(error.response.data, error.response.status);
      }
      
      return ctx.internalServerError('An unexpected error occurred.');
    }
  },

  /**
   * Fetches the active subscription plan for the currently authenticated user.
   */
  async myActivePlan(ctx) {
    let user;
    try {
      // Manual authentication to get the user from the JWT token
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];

      const { id: userId } = await strapi.plugin('users-permissions').service('jwt').verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token: User ID not found.');
      }

      user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
      if (!user) {
        return ctx.unauthorized('User not found for this token.');
      }

      // Fetch subscription details from the external subsystem
      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

      if (!subscriptionUrl || !secret) {
        strapi.log.error("Subscription environment variables (SUBSYS_BASE_URL, SUBSCRIPTION_SERVICE_SECRET) are not set.");
        return ctx.internalServerError("Subscription service is not configured on the server.");
      }

      const response = await axios.get(`${subscriptionUrl}/api/v1/subscription-of-a-user/${user.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
      });

      // Return the data from the subsystem directly
      ctx.body = response.data;

    } catch (err) {
      // Handle token errors
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      
      const userIdLog = user ? `for user ${user.id}` : '';
      strapi.log.error(`Error fetching active plan in subscription controller ${userIdLog}:`, err);
      
      // Forward the error from the subsystem if available
      if (err.isAxiosError && err.response) {
        return ctx.send(err.response.data, err.response.status);
      }

      return ctx.internalServerError('An error occurred while fetching the subscription plan.', { moreDetails: err.message });
    }
  }
};