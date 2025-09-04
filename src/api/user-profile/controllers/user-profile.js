'use strict';
const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::user-profile.user-profile', ({ strapi }) => ({

  async findMine(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      if (!userId) return ctx.unauthorized('Invalid token.');

      const requestedLocale = ctx.query.locale;
      const queryLocale = requestedLocale || 'all';

      // ✅ Populate only specific fields of the related personality_result.
      const basePopulate = {
        children: true,
        personality_result: {
          fields: ['title', 'description', 'power_tip', 'ps_id', 'locale', 'createdAt', 'updatedAt'],
          // No nested populate here → prevents cycles (no user_profiles/createdBy/updatedBy/localizations)
        },
      };

      let profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: { users_permissions_user: { id: userId } },
        locale: queryLocale,
        populate: basePopulate,
      });

      if ((!profiles || profiles.length === 0) && requestedLocale) {
        profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
          filters: { users_permissions_user: { id: userId } },
          locale: 'all',
          populate: basePopulate,
        });
      }

      if (!profiles?.length) return ctx.notFound('No user profile found for the current user.');

      // Prefer requested or default locale when multiple exist
      let profile = profiles[0];
      if (requestedLocale && profiles.length > 1) {
        const exact = profiles.find(p => p.locale === requestedLocale);
        if (exact) profile = exact;
      } else if (!requestedLocale && profiles.length > 1) {
        try {
          const defaultLocale = await strapi.plugin('i18n').service('locales').getDefaultLocale();
          const def = profiles.find(p => p.locale === defaultLocale);
          if (def) profile = def;
        } catch (_) {}
      }

      return this.transformResponse(profile);
    } catch (err) {
      strapi.log.error('Error in custom user-profile findMine', err);
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      return ctx.internalServerError('An error occurred while fetching the profile.');
    }
  },

  async updateMine(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      if (!userId) return ctx.unauthorized('Invalid token.');

      const requestedLocale = ctx.query.locale;
      const profiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: { users_permissions_user: { id: userId } },
        locale: requestedLocale || 'all',
      });
      if (!profiles?.length) return ctx.notFound('No user profile found for the current user.');
      const profileId = profiles[0].id;

      const body = ctx.request.body?.data || {};
      const updateData = {};

      if (typeof body.consentForEmailNotice === 'boolean') {
        updateData.consentForEmailNotice = body.consentForEmailNotice;
      }
      if (Array.isArray(body.children)) {
        updateData.children = body.children;
      }

      // Require numeric Strapi id for relation (no ps_id here)
      if (Number.isInteger(body.personality_result)) {
        updateData.personality_result = body.personality_result;
      } else if (body.personality_result?.id && Number.isInteger(body.personality_result.id)) {
        updateData.personality_result = body.personality_result.id;
      } else if ('personality_result' in body) {
        return ctx.badRequest('personality_result must be a numeric id (e.g., 4).');
      }

      // ✅ Return only the clean, non-cyclic fields on the related entry
      const updated = await strapi.entityService.update('api::user-profile.user-profile', profileId, {
        data: updateData,
        populate: {
          children: true,
          personality_result: {
            fields: ['title', 'description', 'power_tip', 'ps_id', 'locale', 'createdAt', 'updatedAt'],
          },
        },
      });

      return this.transformResponse(updated);
    } catch (err) {
      strapi.log.error('Error in custom user-profile updateMine', err);
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      return ctx.internalServerError('An error occurred while updating the profile.');
    }
  },
    /**
   * Unregister and delete the currently authenticated user.
   * This function will:
   * 1. Get the user from the secure context (provided by Strapi's auth).
   * 2. Delete the user's associated 'user-profile'.
   * 3. Delete the user from the core 'users-permissions' plugin.
   */
  async unregister(ctx) {
    const { id: userId, email } = ctx.state.user;

    console.log(`Unregistration process started for user: ${email} (ID: ${userId})`);

    try {
      // (Optional but good practice) Delete the user's associated profile first
      const userProfiles = await strapi.entityService.findMany('api::user-profile.user-profile', {
        filters: { user: userId },
      });
      
      if (userProfiles && userProfiles.length > 0) {
        await strapi.entityService.delete('api::user-profile.user-profile', userProfiles[0].id);
        console.log(`Deleted user-profile for user ID: ${userId}`);
      }

      // Delete the user from the Users & Permissions plugin
      await strapi.plugin('users-permissions').service('user').remove({ id: userId });

      // ✅ REMOVED THE CHECK for a missing user.
      // The process will now always proceed to the success response,
      // ensuring the client gets a success message even if the user was already deleted.

      console.log(`Successfully completed unregistration process for user ID: ${userId}`);

      // Return a success response
      return ctx.send({
        message: 'Your account has been successfully deleted.',
      });

    } catch (err) {
      console.error('Error during unregistration:', err);
      return ctx.internalServerError('An error occurred during the unregistration process.');
    }
  },
}));
