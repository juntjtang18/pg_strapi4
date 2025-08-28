'use strict';

module.exports = {
  // Grab the "old" values BEFORE Strapi writes the update
  async beforeUpdate(event) {
    try {
      const where = event.params?.where || {};
      const profileId =
        where.id ??
        (Array.isArray(where.$and) && where.$and.find(c => c.id)?.id) ??
        null;

      if (!profileId) {
        strapi.log.warn('[user-profile] beforeUpdate: could not resolve profile id from where:', where);
        return;
      }

      const prev = await strapi.entityService.findOne(
        'api::user-profile.user-profile',
        profileId,
        { populate: ['personality_result', 'users_permissions_user'] }
      );

      event.state = event.state || {};
      event.state.prevPersonalityId = prev?.personality_result?.id || null;
      event.state.userId = prev?.users_permissions_user?.id || null;

      const incomingPr = event.params?.data?.personality_result ?? null;
      strapi.log.info(
        `[user-profile] beforeUpdate: userId=${event.state.userId} prevPr=${event.state.prevPersonalityId} incomingPr=${incomingPr}`
      );
    } catch (e) {
      strapi.log.error('[user-profile] beforeUpdate error', e);
    }
  },

  // Compare old vs new AFTER the update, then resync
  async afterUpdate(event) {
    try {
      const oldPrId = event.state?.prevPersonalityId || null;
      const userId  = event.state?.userId || null;

      // New value can be read from the result (populated entity) or from params.data
      const newPrFromResult = event.result?.personality_result?.id ?? null;
      const newPrFromParams = Number.isInteger(event.params?.data?.personality_result)
        ? event.params.data.personality_result
        : null;
      const newPrId = newPrFromResult || newPrFromParams || null;

      strapi.log.info(
        `[user-profile] afterUpdate: userId=${userId} oldPr=${oldPrId} newPr=${newPrId}`
      );

      if (userId && newPrId && oldPrId !== newPrId) {
        strapi.log.info('[user-profile] personality changed, resyncing recommendations…');
        await strapi.service('api::recommendation.reco').resyncForPersonalityChangeSimple(userId, newPrId);
        strapi.log.info('[user-profile] resync complete.');
      } else {
        strapi.log.info('[user-profile] no personality change detected; skip resync.');
      }
    } catch (e) {
      strapi.log.error('[user-profile] afterUpdate error', e);
    }
  },
};
