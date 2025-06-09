'use strict';

module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/user-profiles/mine',
      handler: 'user-profile.updateMine',
      config: {
        // This forces Strapi to skip the broken permission layer.
        // Security will be handled inside the controller.
        auth: false,
      },
    },
  ],
};