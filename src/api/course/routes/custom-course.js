module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/courses/:id/createlocale',
      handler: 'course.createlocale',
      config: {
        auth: false, // or true if needed
      },
    },
    {
      method: 'POST',
      path: '/courses/:id/translate',
      handler: 'course.translate',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/courses/createlocale/all',
      handler: 'course.createlocaleAll',
      config: { auth: false }, // we verify the Bearer token in the controller
    },
    {
      method: 'POST',
      path: '/courses/reassigncat',
      handler: 'course.reassigncat',
      config: { auth: false }, // we still require Bearer in controller
    },
    {
      method: 'POST',
      path: '/courses/translateall',
      handler: 'course.translateAll',
      config: { auth: false }, // we verify JWT manually inside
    },    
    {
      method: 'POST',
      path: '/courses/:id/backfill',
      handler: 'course.backfill',
      config: { auth: false },
    },

  ],
};
