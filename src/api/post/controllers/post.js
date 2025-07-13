'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::post.post', ({ strapi }) => ({
  /**
   * Custom controller to fetch posts with the author's username.
   * This is useful when the authenticated role does not have permission to find users.
   * The response is formatted to match the standard Strapi API structure for collections.
   * @param {object} ctx - The Koa context object.
   * @returns {object} - An object containing the formatted post data and pagination metadata.
   */
  async findWithUsername(ctx) {
    const { query } = ctx;

    // Use findPage to get posts with pagination
    const { results: posts, pagination } = await strapi.entityService.findPage('api::post.post', {
      ...query,
      populate: {
        users_permissions_user: {
          fields: ['username'],
        },
        media: true,
        likes: true,
      },
    });

    // Manually format the response to include the username in the desired structure
    const formattedData = posts.map(post => {
      const { id, users_permissions_user, media, likes, ...attributes } = post;

      const formattedPost = {
        id,
        attributes: {
          ...attributes,
          // Format the user object
          users_permissions_user: users_permissions_user ? {
            data: {
              id: users_permissions_user.id,
              attributes: {
                username: users_permissions_user.username,
              },
            },
          } : {
            data: null,
          },
          // Format the media object
          media: {
            data: media ? media.map(m => ({ id: m.id, attributes: m })) : null,
          },
          // Format the likes object to return a count
          likes: {
            data: {
              attributes: {
                count: Array.isArray(likes) ? likes.length : 0,
              },
            },
          },
        },
      };

      return formattedPost;
    });

    return {
      data: formattedData,
      meta: { pagination },
    };
  },
}));