// src/api/moderation-block/routes/moderation-block-custom-route.js
module.exports = {
  routes: [
    // body-based to avoid encoding: { username?: string, userId?: number }
    { method: 'POST', path: '/moderation/block',   handler: 'moderation-block.blockUser', config: { auth: false } },
    { method: 'POST', path: '/moderation/unblock', handler: 'moderation-block.unblockUser', config: { auth: false } },
    { method: 'GET',  path: '/moderation/blocks',  handler: 'moderation-block.myBlocks', config: { auth: false } },
  ]
};
