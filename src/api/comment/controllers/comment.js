// ./src/api/comment/controllers/comment.js

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::comment.comment', ({ strapi }) => ({
  /**
   * Custom controller to fetch comments with the author's username.
   * This also supports pagination and filtering by postId.
   * @param {object} ctx - The Koa context object.
   * @returns {object} - An object containing the formatted comment data and pagination metadata.
   */
  async findWithAuthor(ctx) {
    console.log("Entering findWithAuthor custom controller...");
    const { query } = ctx;

    const filters = query.filters || {};

    if (query.postId) {
      filters.post = { id: { $eq: query.postId } };
    }
    
    const page = query.pagination?.page || query.page || 1;
    const pageSize = query.pagination?.pageSize || query.pageSize || 25;

    const { results: comments, pagination } = await strapi.entityService.findPage('api::comment.comment', {
      filters,
      sort: query.sort,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      populate: {
        author: {
          fields: ['username'],
        },
      },
    });

    const formattedData = comments.map(comment => {
      const { id, author, ...attributes } = comment;
      return {
        id,
        attributes: {
          ...attributes,
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
  
  /**
   * Custom controller to override the default findOne behavior for comments.
   * Fetches a single comment and formats it to include the author's username.
   * @param {object} ctx - The Koa context object.
   */
  async findOneWithAuthor(ctx) {
    console.log("Entering findOneWithAuthor custom controller...");
    const { id } = ctx.params;
    const { query } = ctx;

    const entity = await strapi.entityService.findOne('api::comment.comment', id, {
      ...query,
      populate: {
        author: {
          fields: ['username'],
        },
      },
    });

    if (!entity) {
      return ctx.notFound('Comment not found');
    }

    const { author, ...attributes } = entity;
    const formattedComment = {
      id: entity.id,
      attributes: {
        ...attributes,
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
    
    const sanitizedEntity = await this.sanitizeOutput(formattedComment, ctx);
    return this.transformResponse(sanitizedEntity);
  },
  
  /**
   * Override the default create controller
   * @param {object} ctx
   */
  async create(ctx) {
    // --- DEBUG LOGGING START ---
    console.log('--- Custom Comment Create Controller Triggered ---');
    
    const user = ctx.state.user;

    if (!user) {
      console.log('No authenticated user found. Aborting with unauthorized error.');
      return ctx.unauthorized("You must be logged in to create a comment.");
    }
    
    console.log(`Authenticated user found: ID=${user.id}, Username=${user.username}`);
    
    // Get the data from the request body
    const { data } = ctx.request.body;
    console.log('Original request data:', JSON.stringify(data, null, 2));

    // Add the author id to the data object
    data.author = user.id;

    console.log('Data being sent to entityService.create:', JSON.stringify(data, null, 2));
    
    // Use the entity service to create the comment directly
    const entity = await strapi.entityService.create('api::comment.comment', {
      data: data,
      // You can populate the response if you want
      // populate: { author: true } 
    });

    console.log('--- Entity Service Create Successful ---');

    // Sanitize and transform the response to match Strapi's default output
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));