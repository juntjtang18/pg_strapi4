'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const BLOCK_UID = 'api::moderation-block.moderation-block';

// ---- helpers ---------------------------------------------------------------

// Merge an author $notIn into existing comment filters
function mergeCommentAuthorNotIn(filters = {}, blockedIds = []) {
  if (!blockedIds?.length) return filters;

  const existingAuthor = filters.author ?? {};
  const existingAuthorId = existingAuthor.id ?? {};
  return {
    ...filters,
    author: {
      ...existingAuthor,
      id: {
        ...existingAuthorId,
        $notIn: blockedIds,
      },
    },
  };
}

// Get the current user's blocked user IDs (never throws; returns [])
async function getBlockedUserIds(strapi, ctx) {
  const userId = ctx.state.user?.id;
  if (!userId) return [];

  try {
    const blocks = await strapi.entityService.findMany(BLOCK_UID, {
      filters: { blocker: userId },
      populate: { blocked: { fields: ['id'] } },
      fields: ['id'],
      limit: 500,
    });

    return (blocks || [])
      .map(b => b?.blocked?.id)
      .filter(Boolean);
  } catch (err) {
    strapi.log.error(`[comment controller] Failed to load blocks: ${err.message}`);
    return [];
  }
}

// ----------------------------------------------------------------------------

module.exports = createCoreController('api::comment.comment', ({ strapi }) => ({

  /**
   * GET /getcomments
   * Fetch paginated comments for a post, excluding comments authored by users
   * the current user has blocked.
   */
  async findCommentsForAPost(ctx) {
    const { query } = ctx;

    // 1) base filters
    let filters = query.filters || {};
    if (query.postId) {
      filters.post = { id: { $eq: query.postId } };
    }

    // 2) apply block filter
    const blockedIds = await getBlockedUserIds(strapi, ctx);
    filters = mergeCommentAuthorNotIn(filters, blockedIds);

    // 3) pagination + sort
    const page = Number(query?.pagination?.page ?? query.page ?? 1);
    const pageSize = Number(query?.pagination?.pageSize ?? query.pageSize ?? 25);
    const sort = query.sort || { createdAt: 'desc' };

    // 4) fetch
    const { results: comments, pagination } = await strapi.entityService.findPage('api::comment.comment', {
      filters,
      sort,
      page,
      pageSize,
      populate: { author: { fields: ['id', 'username'] } },
    });

    // 5) format
    const formattedData = comments.map(comment => {
      const { id, author, ...attributes } = comment;
      return {
        id,
        attributes: {
          ...attributes,
          author: author
            ? { data: { id: author.id, attributes: { username: author.username } } }
            : { data: null },
        },
      };
    });

    return { data: formattedData, meta: { pagination } };
  },

  /**
   * GET /comments/:id
   * Fetch a single comment including author.username.
   * If the author is blocked by the current user, hide it (404).
   */
  async findOneWithAuthor(ctx) {
    const { id } = ctx.params;
    const { query } = ctx;

    const entity = await strapi.entityService.findOne('api::comment.comment', id, {
      ...query,
      populate: { author: { fields: ['id', 'username'] } },
    });
    if (!entity) return ctx.notFound('Comment not found');

    // hide if author is blocked
    const blockedIds = await getBlockedUserIds(strapi, ctx);
    if (entity.author?.id && blockedIds.includes(entity.author.id)) {
      return ctx.notFound('Comment not found');
    }

    const { author, ...attributes } = entity;
    const formattedComment = {
      id: entity.id,
      attributes: {
        ...attributes,
        author: author
          ? { data: { id: author.id, attributes: { username: author.username } } }
          : { data: null },
      },
    };

    const sanitizedEntity = await this.sanitizeOutput(formattedComment, ctx);
    return this.transformResponse(sanitizedEntity);
  },

  /**
   * POST /comments
   * Create a comment; sets the current user as author.
   */
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in to create a comment.');

    const { data } = ctx.request.body;
    data.author = user.id;

    const entity = await strapi.entityService.create('api::comment.comment', { data });
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },

}));
