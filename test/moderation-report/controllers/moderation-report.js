'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const REASONS = new Set(['spam','harassment','hate','sexual','violence','illegal','other']);

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

module.exports = createCoreController('api::moderation-report.moderation-report', ({ strapi }) => ({

  // POST /moderation/report/post
  // body: { postId: number, reason: enum, details?: string }
  async reportPost(ctx) {
    try {
      const userId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!userId) return;

      const b = ctx.request.body?.data || ctx.request.body || {};
      const postId = Number(b.postId);
      const { reason, details } = b;

      if (!Number.isFinite(postId)) return ctx.badRequest('postId required.');
      if (!REASONS.has(reason))    return ctx.badRequest('Invalid reason.');

      const post = await strapi.entityService.findOne('api::post.post', postId, {
        populate: { users_permissions_user: { fields: ['id'] } }
      });
      if (!post) return ctx.notFound('Post not found');

      const existing = await strapi.entityService.findMany('api::moderation-report.moderation-report', {
        filters: { target_type: 'post', target_id: postId, reporter: userId, status: 'open' },
        limit: 1,
      });
      if (existing.length) return ctx.conflict('Report already exists');

      const created = await strapi.entityService.create('api::moderation-report.moderation-report', {
        data: {
          target_type: 'post',
          target_id: postId,
          reason,
          details,
          status: 'open',
          reporter: userId,
          offender: post.users_permissions_user?.id ?? null,
        }
      });

      ctx.body = { id: created.id, status: created.status };
    } catch (err) {
      strapi.log.error('Error in reportPost', err);
      return ctx.internalServerError('Failed to create post report.');
    }
  },

  // POST /moderation/report/comment
  // body: { commentId: number, reason: enum, details?: string }
  async reportComment(ctx) {
    try {
      const userId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!userId) return;

      const b = ctx.request.body?.data || ctx.request.body || {};
      const commentId = Number(b.commentId);
      const { reason, details } = b;

      if (!Number.isFinite(commentId)) return ctx.badRequest('commentId required.');
      if (!REASONS.has(reason))        return ctx.badRequest('Invalid reason.');

      const comment = await strapi.entityService.findOne('api::comment.comment', commentId, {
        populate: { author: { fields: ['id'] } }
      });
      if (!comment) return ctx.notFound('Comment not found');

      const existing = await strapi.entityService.findMany('api::moderation-report.moderation-report', {
        filters: { target_type: 'comment', target_id: commentId, reporter: userId, status: 'open' },
        limit: 1,
      });
      if (existing.length) return ctx.conflict('Report already exists');

      const created = await strapi.entityService.create('api::moderation-report.moderation-report', {
        data: {
          target_type: 'comment',
          target_id: commentId,
          reason,
          details,
          status: 'open',
          reporter: userId,
          offender: comment.author?.id ?? null,
        }
      });

      ctx.body = { id: created.id, status: created.status };
    } catch (err) {
      strapi.log.error('Error in reportComment', err);
      return ctx.internalServerError('Failed to create comment report.');
    }
  },

  // POST /moderation/report/user
  // body: { username?: string, userId?: number, reason: enum, details?: string }
  async reportUser(ctx) {
    try {
      const reporterId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!reporterId) return;

      const b = ctx.request.body?.data || ctx.request.body || {};
      const { username, userId, reason, details } = b;
      if (!REASONS.has(reason)) return ctx.badRequest('Invalid reason.');

      let offender;
      if (Number.isFinite(Number(userId))) {
        offender = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: Number(userId) } });
      } else if (typeof username === 'string' && username.length) {
        offender = await strapi.query('plugin::users-permissions.user').findOne({ where: { username } });
      } else {
        return ctx.badRequest('username or userId required.');
      }

      if (!offender) return ctx.notFound('User not found');
      if (offender.id === reporterId) return ctx.badRequest('Cannot report yourself');

      const existing = await strapi.entityService.findMany('api::moderation-report.moderation-report', {
        filters: { target_type: 'user', target_id: offender.id, reporter: reporterId, status: 'open' },
        limit: 1,
      });
      if (existing.length) return ctx.conflict('Report already exists');

      const created = await strapi.entityService.create('api::moderation-report.moderation-report', {
        data: {
          target_type: 'user',
          target_id: offender.id,
          reason,
          details,
          status: 'open',
          reporter: reporterId,
          offender: offender.id,
        }
      });

      ctx.body = { id: created.id, status: created.status };
    } catch (err) {
      strapi.log.error('Error in reportUser', err);
      return ctx.internalServerError('Failed to create user report.');
    }
  },

  // POST /moderation/report/resolve
  // body: { reportId: number, action_taken: 'removed_content'|'warned_user'|'banned_user'|'no_violation' }
  async resolve(ctx) {
    try {
      const actingUserId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!actingUserId) return;

      // OPTIONAL: check role if you want to enforce admin here
      const actingUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: actingUserId }, populate: { role: true }
      });
      // Example gate — tweak to your role names:
      if (!actingUser?.role || !['admin','administrator','Admin','Administrator'].includes(actingUser.role.type || actingUser.role.name)) {
        // If you prefer: allow, but it’s safer to gate here
        return ctx.forbidden('Admin only.');
      }

      const b = ctx.request.body?.data || ctx.request.body || {};
      const reportId = Number(b.reportId);
      const { action_taken } = b;

      if (!Number.isFinite(reportId)) return ctx.badRequest('reportId required.');
      const allowed = new Set(['removed_content','warned_user','banned_user','no_violation']);
      if (!allowed.has(action_taken)) return ctx.badRequest('Invalid action.');

      const now = new Date().toISOString();
      const updated = await strapi.entityService.update('api::moderation-report.moderation-report', reportId, {
        data: { status: 'resolved', action_taken, handled_by: actingUserId, handle_at: now }
      });

      ctx.body = { id: updated.id, status: updated.status, action_taken: updated.action_taken };
    } catch (err) {
      strapi.log.error('Error in resolve', err);
      return ctx.internalServerError('Failed to resolve report.');
    }
  },

}));
