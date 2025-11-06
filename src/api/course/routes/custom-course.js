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
  ],
};
