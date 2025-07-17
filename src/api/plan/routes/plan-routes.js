// src/api/plan/routes/plan.js
module.exports = {
    routes: [
      {
        method: 'GET',
        path: '/plans', // The endpoint will be /api/plans
        handler: 'plan.find',
        config: {
          auth: false, // Make the endpoint public
        },
      },
    ],
  };