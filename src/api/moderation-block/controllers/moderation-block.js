'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

async function getUserIdFromAuthHeader(ctx, strapi) {
  const authHeader = ctx.request.header.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.unauthorized('Missing or invalid authorization header.');
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const { id: userId } = await strapi.plugins['users-permissions'].services.jwt.verify(token);
    if (!userId) {
      ctx.unauthorized('Invalid token.');
      return null;
    }
    return userId;
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      ctx.unauthorized('Invalid or expired token.');
      return null;
    }
    throw err;
  }
}

async function findTargetUser(strapi, { userId, username }) {
  if (Number.isFinite(Number(userId))) {
    return await strapi.query('plugin::users-permissions.user').findOne({ where: { id: Number(userId) } });
  }
  if (typeof username === 'string' && username.length) {
    return await strapi.query('plugin::users-permissions.user').findOne({ where: { username } });
  }
  return null;
}

module.exports = createCoreController('api::moderation-block.moderation-block', ({ strapi }) => ({

  // POST /moderation/block   body: { username?: string, userId?: number }
  async blockUser(ctx) {
    try {
      const meId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!meId) return;

      const b = ctx.request.body?.data || ctx.request.body || {};
      const target = await findTargetUser(strapi, { userId: b.userId, username: b.username });
      if (!target) return ctx.badRequest('username or userId required (or user not found)');
      if (target.id === meId) return ctx.badRequest('Cannot block yourself');

      const existing = await strapi.entityService.findMany('api::moderation-block.moderation-block', {
        filters: { blocker: meId, blocked: target.id }, limit: 1
      });
      if (existing[0]) { ctx.body = { ok: true, id: existing[0].id }; return; }

      const created = await strapi.entityService.create('api::moderation-block.moderation-block', {
        data: { blocker: meId, blocked: target.id }
      });

      ctx.body = { ok: true, id: created.id };
    } catch (err) {
      strapi.log.error('Error in blockUser', err);
      return ctx.internalServerError('Failed to block user.');
    }
  },

  // POST /moderation/unblock   body: { username?: string, userId?: number }
  async unblockUser(ctx) {
    try {
      const meId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!meId) return;

      const b = ctx.request.body?.data || ctx.request.body || {};
      const target = await findTargetUser(strapi, { userId: b.userId, username: b.username });
      if (!target) return ctx.badRequest('username or userId required (or user not found)');

      const rows = await strapi.entityService.findMany('api::moderation-block.moderation-block', {
        filters: { blocker: meId, blocked: target.id }, limit: 1
      });
      if (rows[0]) await strapi.entityService.delete('api::moderation-block.moderation-block', rows[0].id);

      ctx.body = { ok: true };
    } catch (err) {
      strapi.log.error('Error in unblockUser', err);
      return ctx.internalServerError('Failed to unblock user.');
    }
  },

  // GET /moderation/blocks
  async myBlocks(ctx) {
    try {
      const meId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!meId) return;

      const rows = await strapi.entityService.findMany('api::moderation-block.moderation-block', {
        filters: { blocker: meId },
        populate: { blocked: { fields: ['id','username'] } },
        limit: 1000
      });

      ctx.body = rows
        .map(r => r.blocked)
        .filter(Boolean)
        .map(u => ({ id: u.id, username: u.username }));
    } catch (err) {
      strapi.log.error('Error in myBlocks', err);
      return ctx.internalServerError('Failed to load blocks.');
    }
  },

}));
