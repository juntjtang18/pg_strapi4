'use strict';

/**
 * user-profile controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::user-profile.user-profile', ({ strapi }) => ({

  /**
   * Finds the profile for the currently logged-in user.
   */
  async findMine(ctx) {
    try {
      // 1. Get and validate the JWT token
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];

      // 2. Verify token and extract user ID
      const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token.');
      }

      // 3. Find the user profile with proper filtering
      const profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: {
          users_permissions_user: {
            id: userId, // Use the correct relation field name
          },
        },
        populate: { children: true }, // Populate related children data
      });

      // 4. Handle case where no profile is found
      if (!profiles || profiles.length === 0) {
        return ctx.notFound('No user profile found for the current user.');
      }

      // 5. Return the first matching profile
      return this.transformResponse(profiles[0]);

    } catch (err) {
      strapi.log.error('Error in custom user-profile find', err);
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      return ctx.internalServerError('An error occurred while fetching the profile.');
    }
  },

  /**
   * Updates the profile for the currently logged-in user.
   */
  async updateMine(ctx) {
    try {
      // 1. Get and validate the JWT token
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];

      // 2. Verify token and extract user ID
      const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token.');
      }

      // 3. Find the user-profile entry that belongs to this user
      const profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: {
          users_permissions_user: {
            id: userId, // Use the correct relation field name
          },
        },
      });

      // 4. Handle case where no profile is found
      if (!profiles || profiles.length === 0) {
        return ctx.notFound('No user profile found for the current user.');
      }
      const profileId = profiles[0].id;

      // 5. Update the found profile with the data from the request body
      const updatedProfile = await strapi.entityService.update('api::user-profile.user-profile', profileId, {
        data: ctx.request.body.data,
      });

      // 6. Return the updated profile data
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