'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// Define how many comments to show in the post list preview.
const COMMENTS_PREVIEW_SIZE = 3;

module.exports = createCoreController('api::post.post', ({ strapi }) => ({
  /**
   * REFACTORED: Fetches a paginated list of posts. Each post includes the
   * first page of its comments (up to COMMENTS_PREVIEW_SIZE) and comment pagination metadata.
   * Mapped to: GET /getposts
   * @param {object} ctx - The Koa context object.
   */
  async findWithFirstPageComments(ctx) {
    const { query } = ctx;

    // 1. Fetch the paginated list of posts
    const { page = 1, pageSize = 10 } = query.pagination || {};
    const { results: posts, pagination: postsPagination } = await strapi.entityService.findPage('api::post.post', {
      ...query,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      populate: { users_permissions_user: { fields: ['username'] }, media: true, likes: true },
    });

    if (!posts.length) {
      return { data: [], meta: { pagination: postsPagination } };
    }

    // 2. Get the IDs of the fetched posts
    const postIds = posts.map(p => p.id);

    // 3. Fetch all comments for these posts for the preview
    const allComments = await strapi.entityService.findMany('api::comment.comment', {
      filters: { post: { id: { $in: postIds } } },
      populate: {
        author: { fields: ['username'] },
        post: { fields: ['id'] },
      },
      sort: { createdAt: 'desc' },
    });

    // 4. Fetch data to count all comments for each post
    const commentCounts = await strapi.entityService.findMany('api::comment.comment', {
      filters: { post: { id: { $in: postIds } } },
      fields: ['id'], // Fetch a minimal field to be efficient
      populate: { post: { fields: ['id'] } },
    });

    // 5. Create a map of { postId: totalCommentCount }
    const totalCommentsByPostId = commentCounts.reduce((acc, comment) => {
      const postId = comment.post.id;
      if (postId) {
        acc[postId] = (acc[postId] || 0) + 1;
      }
      return acc;
    }, {});


    // 6. Group the fetched comment entities by their post ID
    const commentsByPostId = allComments.reduce((acc, comment) => {
      const postId = comment.post.id;
      if (!acc[postId]) acc[postId] = [];
      acc[postId].push(comment);
      return acc;
    }, {});

    // 7. Format the final response with sliced comments and the new meta object
    const formattedData = posts.map(post => {
      const { users_permissions_user, media, likes, ...postAttributes } = post;
      const postComments = (commentsByPostId[post.id] || []).slice(0, COMMENTS_PREVIEW_SIZE);
      const totalComments = totalCommentsByPostId[post.id] || 0;

      return {
        id: post.id,
        attributes: {
          ...postAttributes,
          users_permissions_user: users_permissions_user ? { data: { id: users_permissions_user.id, attributes: { username: users_permissions_user.username } } } : { data: null },
          media: { data: media ? media.map(m => ({ id: m.id, attributes: m })) : null },
          likes: { data: { attributes: { count: Array.isArray(likes) ? likes.length : 0 } } },
          comments: {
            data: postComments.map(comment => {
              const { author, ...commentAttributes } = comment;
              return { id: comment.id, attributes: { ...commentAttributes, author: author ? { data: { id: author.id, attributes: { username: author.username } } } : { data: null } } };
            }),
            // --- ADDED META OBJECT FOR COMMENTS ---
            meta: {
              pagination: {
                page: 1,
                pageSize: COMMENTS_PREVIEW_SIZE,
                pageCount: Math.ceil(totalComments / COMMENTS_PREVIEW_SIZE),
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
   * REFACTORED: Fetches a single post by its ID, along with its paginated comments.
   * Mapped to: GET /posts/:id
   * @param {object} ctx - The Koa context object.
   */
  async findOneWithDetails(ctx) {
    const { id } = ctx.params;
    const { query } = ctx;

    // 1. Fetch the main post entity
    const post = await strapi.entityService.findOne('api::post.post', id, {
      populate: { users_permissions_user: { fields: ['username'] }, media: true, likes: true },
    });

    if (!post) {
      return ctx.notFound('Post not found');
    }

    // 2. Fetch paginated comments for the post based on query params
    const { page = 1, pageSize = 10 } = query.pagination || {};
    const { results: comments, pagination: commentsPagination } = await strapi.entityService.findPage('api::comment.comment', {
      filters: { post: { id } },
      sort: { createdAt: 'desc' },
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      populate: { author: { fields: ['username'] } },
    });

    // 3. Format the response
    const { users_permissions_user, media, likes, ...postAttributes } = post;
    const formattedPost = {
      id: post.id,
      attributes: {
        ...postAttributes,
        users_permissions_user: users_permissions_user ? { data: { id: users_permissions_user.id, attributes: { username: users_permissions_user.username } } } : { data: null },
        media: { data: media ? media.map(m => ({ id: m.id, attributes: m })) : null },
        likes: { data: { attributes: { count: Array.isArray(likes) ? likes.length : 0 } } },
        comments: {
          data: comments.map(comment => {
            const { author, ...commentAttributes } = comment;
            return { id: comment.id, attributes: { ...commentAttributes, author: author ? { data: { id: author.id, attributes: { username: author.username } } } : { data: null } } };
          }),
          meta: { pagination: commentsPagination },
        },
      },
    };
    
    // 4. Sanitize and return
    const sanitizedEntity = await this.sanitizeOutput(formattedPost, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));