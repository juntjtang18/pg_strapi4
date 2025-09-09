'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// How many comments to show in the post list preview.
const COMMENTS_PREVIEW_SIZE = 3;

// Your block model UID (from your schema)
const BLOCK_UID = 'api::moderation-block.moderation-block';

// --- helpers ---------------------------------------------------------------

// Merge an author $notIn into existing post filters
function mergePostAuthorNotIn(filters = {}, blockedIds = []) {
  if (!blockedIds?.length) return filters;

  const existingUser = filters.users_permissions_user ?? {};
  const existingUserId = existingUser.id ?? {};
  return {
    ...filters,
    users_permissions_user: {
      ...existingUser,
      id: {
        ...existingUserId,
        $notIn: blockedIds,
      },
    },
  };
}

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
    strapi.log.error(`[post controller] Failed to load blocks: ${err.message}`);
    return [];
  }
}

// --------------------------------------------------------------------------

module.exports = createCoreController('api::post.post', ({ strapi }) => ({

  /**
   * GET /getposts
   * Fetch a paginated list of posts (excluding blocked authors) and include
   * a preview page of comments (also excluding blocked authors) + preview meta.
   */
  async findWithFirstPageComments(ctx) {
    const { query } = ctx;

    // 0) Current user's block list
    const blockedIds = await getBlockedUserIds(strapi, ctx);

    // 1) Merge client filters + author $notIn
    const clientFilters = query.filters || {};
    const mergedFilters = mergePostAuthorNotIn(clientFilters, blockedIds);

    // 2) Pagination & sort
    const page = Number(query?.pagination?.page ?? query['pagination[page]'] ?? 1);
    const pageSize = Number(query?.pagination?.pageSize ?? query['pagination[pageSize]'] ?? 10);
    const sort = query.sort || { createdAt: 'desc' };

    // 3) Fetch paginated posts (already filtered by blocked authors)
    const { results: posts, pagination: postsPagination } = await strapi.entityService.findPage('api::post.post', {
      filters: mergedFilters,
      sort,
      page,
      pageSize,
      populate: {
        users_permissions_user: { fields: ['id', 'username'] },
        media: true,
        likes: true,
      },
    });

    if (!posts.length) {
      return { data: [], meta: { pagination: postsPagination } };
    }

    // 4) Collect post ids for preview comments
    const postIds = posts.map(p => p.id);

    // 5) Fetch preview comments (exclude blocked authors)
    const previewCommentFilters = mergeCommentAuthorNotIn(
      { post: { id: { $in: postIds } } },
      blockedIds
    );
    const allComments = await strapi.entityService.findMany('api::comment.comment', {
      filters: previewCommentFilters,
      populate: {
        author: { fields: ['id', 'username'] },
        post: { fields: ['id'] },
      },
      sort: { createdAt: 'desc' },
      // We’ll slice per post locally; keep this reasonably bounded by page size
      limit: 10000,
    });

    // 6) Build per-post totals from the filtered list
    const totalCommentsByPostId = {};
    for (const c of allComments) {
      const pid = c?.post?.id;
      if (!pid) continue;
      totalCommentsByPostId[pid] = (totalCommentsByPostId[pid] || 0) + 1;
    }

    // 7) Group comments by post
    const commentsByPostId = allComments.reduce((acc, comment) => {
      const pid = comment?.post?.id;
      if (!pid) return acc;
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(comment);
      return acc;
    }, {});

    // 8) Format response (preview slice + meta)
    const formattedData = posts.map(post => {
      const { users_permissions_user, media, likes, ...postAttributes } = post;
      const postComments = (commentsByPostId[post.id] || []).slice(0, COMMENTS_PREVIEW_SIZE);
      const totalComments = totalCommentsByPostId[post.id] || 0;

      return {
        id: post.id,
        attributes: {
          ...postAttributes,
          users_permissions_user: users_permissions_user
            ? { data: { id: users_permissions_user.id, attributes: { username: users_permissions_user.username } } }
            : { data: null },
          media: { data: media ? media.map(m => ({ id: m.id, attributes: m })) : null },
          likes: { data: { attributes: { count: Array.isArray(likes) ? likes.length : 0 } } },
          comments: {
            data: postComments.map(comment => {
              const { author, ...commentAttributes } = comment;
              return {
                id: comment.id,
                attributes: {
                  ...commentAttributes,
                  author: author
                    ? { data: { id: author.id, attributes: { username: author.username } } }
                    : { data: null },
                },
              };
            }),
            meta: {
              pagination: {
                page: 1,
                pageSize: COMMENTS_PREVIEW_SIZE,
                pageCount: Math.max(1, Math.ceil(totalComments / COMMENTS_PREVIEW_SIZE)),
                total: totalComments,
              },
            },
          },
        },
      };
    });

    return { data: formattedData, meta: { pagination: postsPagination } };
  },

  /**
   * GET /posts/:id
   * Fetch a single post and its paginated comments, excluding comments authored
   * by blocked users.
   */
  async findOneWithDetails(ctx) {
    const { id } = ctx.params;
    const { query } = ctx;

    // Main post
    const post = await strapi.entityService.findOne('api::post.post', id, {
      populate: { users_permissions_user: { fields: ['id', 'username'] }, media: true, likes: true },
    });
    if (!post) return ctx.notFound('Post not found');

    // Block list
    const blockedIds = await getBlockedUserIds(strapi, ctx);

    // Comments pagination
    const page = Number(query?.pagination?.page ?? query['pagination[page]'] ?? 1);
    const pageSize = Number(query?.pagination?.pageSize ?? query['pagination[pageSize]'] ?? 10);

    // Merge filters: target this post + exclude blocked comment authors
    const commentFilters = mergeCommentAuthorNotIn({ post: { id } }, blockedIds);

    const { results: comments, pagination: commentsPagination } = await strapi.entityService.findPage('api::comment.comment', {
      filters: commentFilters,
      sort: { createdAt: 'desc' },
      page,
      pageSize,
      populate: { author: { fields: ['id', 'username'] } },
    });

    const { users_permissions_user, media, likes, ...postAttributes } = post;
    const formattedPost = {
      id: post.id,
      attributes: {
        ...postAttributes,
        users_permissions_user: users_permissions_user
          ? { data: { id: users_permissions_user.id, attributes: { username: users_permissions_user.username } } }
          : { data: null },
        media: { data: media ? media.map(m => ({ id: m.id, attributes: m })) : null },
        likes: { data: { attributes: { count: Array.isArray(likes) ? likes.length : 0 } } },
        comments: {
          data: comments.map(comment => {
            const { author, ...commentAttributes } = comment;
            return {
              id: comment.id,
              attributes: {
                ...commentAttributes,
                author: author
                  ? { data: { id: author.id, attributes: { username: author.username } } }
                  : { data: null },
              },
            };
          }),
          meta: commentsPagination,
        },
      },
    };

    // Sanitize + return
    const sanitizedEntity = await this.sanitizeOutput(formattedPost, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));
