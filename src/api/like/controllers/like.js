'use strict';

/**
 * like controller
 */

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

function formatLike(like) {
  return {
    id: like.id,
    attributes: {
      post: {
        data: like.post
          ? {
              id: like.post.id,
              attributes: {},
            }
          : null,
      },
    },
  };
}

function requestedUserId(ctx) {
  const filters = ctx.query?.filters;
  const userFilter = filters?.users_permissions_user;
  const idFilter = userFilter?.id;
  const value = idFilter?.$eq ?? idFilter?.eq ?? idFilter;
  const userId = Number(value);
  return Number.isFinite(userId) ? userId : null;
}

function requestedPostId(body) {
  const post = body?.data?.post ?? body?.post;
  const postId = Number(post);
  return Number.isFinite(postId) ? postId : null;
}

function requestedBodyUserId(body) {
  const user = body?.data?.users_permissions_user ?? body?.users_permissions_user;
  const userId = Number(user);
  return Number.isFinite(userId) ? userId : null;
}

module.exports = createCoreController('api::like.like', ({ strapi }) => ({
  async find(ctx) {
    try {
      const authUserId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!authUserId) return;

      const filterUserId = requestedUserId(ctx);
      const userId = filterUserId ?? authUserId;
      if (userId !== authUserId) {
        return ctx.forbidden('Cannot fetch likes for another user.');
      }

      const likes = await strapi.entityService.findMany('api::like.like', {
        filters: { users_permissions_user: userId },
        populate: { post: { fields: ['id'] } },
        limit: 1000,
      });

      ctx.body = {
        data: likes.map(formatLike),
        meta: {},
      };
    } catch (err) {
      strapi.log.error('Error in like.find', err);
      return ctx.internalServerError('Failed to load likes.');
    }
  },

  async create(ctx) {
    try {
      const authUserId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!authUserId) return;

      const postId = requestedPostId(ctx.request.body);
      if (!postId) {
        return ctx.badRequest('Invalid post id.');
      }

      const bodyUserId = requestedBodyUserId(ctx.request.body);
      if (bodyUserId && bodyUserId !== authUserId) {
        return ctx.forbidden('Cannot create a like for another user.');
      }

      const existing = await strapi.entityService.findMany('api::like.like', {
        filters: {
          post: postId,
          users_permissions_user: authUserId,
        },
        populate: { post: { fields: ['id'] } },
        limit: 1,
      });

      const like = existing[0] ?? await strapi.entityService.create('api::like.like', {
        data: {
          post: postId,
          users_permissions_user: authUserId,
        },
        populate: { post: { fields: ['id'] } },
      });

      ctx.body = { data: formatLike(like), meta: {} };
    } catch (err) {
      strapi.log.error('Error in like.create', err);
      return ctx.internalServerError('Failed to like post.');
    }
  },

  async delete(ctx) {
    try {
      const userId = await getUserIdFromAuthHeader(ctx, strapi);
      if (!userId) return;

      const likeId = Number(ctx.params.id);
      if (!Number.isFinite(likeId)) {
        return ctx.badRequest('Invalid like id.');
      }

      const likes = await strapi.entityService.findMany('api::like.like', {
        filters: {
          id: likeId,
          users_permissions_user: userId,
        },
        limit: 1,
      });

      if (likes[0]) {
        await strapi.entityService.delete('api::like.like', likeId);
      }

      ctx.body = { ok: true };
    } catch (err) {
      strapi.log.error('Error in like.delete', err);
      return ctx.internalServerError('Failed to unlike post.');
    }
  },
}));
