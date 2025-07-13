'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/getposts',
      handler: 'post.findWithFirstPageComments',
    },
    {
      method: 'GET',
      path: '/posts/:id',
      handler: 'post.findOneWithDetails',
    },
  ],
};
