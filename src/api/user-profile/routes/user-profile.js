'use strict';

module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/user-profiles/mine',
      handler: 'user-profile.updateMine',
      config: {
        auth: false,
      },
    },
    // ADD THIS NEW ROUTE
    {
      method: 'GET',
      path: '/user-profiles/mine',
      handler: 'user-profile.findMine',
      config: {
        auth: false,
      },
    },
        {
      method: 'POST',
      path: '/auth/unregister',
      handler: 'user-profile.unregister',
      config: {
        // We will enable Strapi's authentication middleware.
        // This is the secure way to get the currently logged-in user.
        policies: [],
      },
    },
  ],
};