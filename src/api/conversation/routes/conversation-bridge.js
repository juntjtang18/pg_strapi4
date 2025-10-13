'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/ai/sessions',
      handler: 'conversation.createSession',
      config: { auth: false,
                policies: [],
       },
    },
    {
      method: 'GET',
      path: '/ai/sessions',
      handler: 'conversation.listSessions',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/ai/sessions/:session_id',
      handler: 'conversation.getSession',
      config: { auth: false },
    },
    { method: 'POST', path: '/ai/sessions/:session_id/chat', handler: 'conversation.chat', config: { auth: false } },
    { method: 'POST', path: '/ai/chat', handler: 'conversation.chat', config: { auth: false } },

  ],
};
