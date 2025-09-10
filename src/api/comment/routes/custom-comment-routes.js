'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/getcomments',
      handler: 'comment.findCommentsForAPost',
      config: {
        // By default, custom routes are private and require authentication.
        // You can add specific policies here if needed.
      },
    },
    {
      method: 'GET',
      path: '/comments/:id', // This path overrides the core findOne route
      handler: 'comment.findOneWithAuthor', // Points to the new custom handler
      config: {
        // Your authentication configurations
      },
    },
    {
      // This is the crucial part for your original request.
      // This route overrides the default POST /comments endpoint.
      // It explicitly tells Strapi to use your custom `create` function.
      method: 'POST',
      path: '/comments',
      handler: 'comment.create',
      config: {
        // By default, this will be protected by the authenticated role.
        // Users must be logged in to hit this endpoint.
      },
    },
  ],
};