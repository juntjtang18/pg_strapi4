'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::user-profile.user-profile', ({ strapi }) => ({

  /**
   * This is the final, working version.
   * It manually authenticates the user and updates their profile.
   */
  async updateMine(ctx) {
    try {
      // 1. Manually get the JWT token from the request headers.
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];

      // 2. Verify the token and get the user's ID.
      const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token.');
      }

      // 3. Find the user-profile entry that belongs to this user.
      const profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: { users_permissions_user: userId },
      });

      if (profiles.length === 0) {
        return ctx.notFound('No user profile found for the current user.');
      }
      const profileId = profiles[0].id;

      // 4. Update the found profile with the data from the request body.
      const updatedProfile = await strapi.entityService.update('api::user-profile.user-profile', profileId, {
        data: ctx.request.body.data,
      });

      // 5. Return the updated profile data.
      return this.transformResponse(updatedProfile);

    } catch (err) {
      strapi.log.error('Error in manual user-profile update', err);
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      return ctx.internalServerError('An error occurred while updating the profile.');
    }
  },
}));