'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/articles/transall',
      handler: 'article.transAll',
      config: {
        auth: false,   // keep public for now
        policies: [],
      },
    },
  ],
};
