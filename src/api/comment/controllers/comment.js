'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::comment.comment', ({ strapi }) => ({
  /**
   * Custom controller to fetch comments with the author's username.
   * This also supports pagination and filtering (e.g., by post ID).
   * @param {object} ctx - The Koa context object.
   * @returns {object} - An object containing the formatted comment data and pagination metadata.
   */
  async findWithAuthor(ctx) {
    const { query } = ctx;

    // Use findPage to get comments with pagination and filtering
    const { results: comments, pagination } = await strapi.entityService.findPage('api::comment.comment', {
      ...query,
      populate: {
        author: {
          fields: ['username'],
        },
      },
    });

    // Manually format the response to include the username
    const formattedData = comments.map(comment => {
      const { id, author, ...attributes } = comment;

      return {
        id,
        attributes: {
          ...attributes,
          // Format the author object
          author: author ? {
            data: {
              id: author.id,
              attributes: {
                username: author.username,
              },
            },
          } : {
            data: null,
          },
        },
      };
    });

    return {
      data: formattedData,
      meta: { pagination },
    };
  },
}));