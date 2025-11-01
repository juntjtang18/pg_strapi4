'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/articles/:id/trans',
      handler: 'article.trans',
      config: { auth: false, policies: [] },
    },
  ],
};
