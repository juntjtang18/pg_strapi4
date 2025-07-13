'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/getposts', // Changed from /posts/custom
      handler: 'post.findWithUsername',
      config: {
        // Authentication configurations remain here
      },
    },
  ],
};