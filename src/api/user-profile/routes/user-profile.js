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
  ],
};