module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/me/courses/:courseId/read',
      handler: 'read.logAndUpdate',
    },
  ],
};
