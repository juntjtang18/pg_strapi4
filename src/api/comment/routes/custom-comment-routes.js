'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/getcomments',
      handler: 'comment.findWithAuthor',
      config: {
        // By default, custom routes are private and require authentication.
        // You can add specific policies here if needed.
      },
    },
  ],
};