'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/ai/complete',
      handler: 'llm.complete',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/ai/classify-pillar',
      handler: 'llm.classifyPillar',
      config: { auth: false },
    },
  ],
};
