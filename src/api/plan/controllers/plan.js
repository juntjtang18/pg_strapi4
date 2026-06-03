'use strict';

module.exports = {
  async find(ctx) {
    const body = {
      error: 'Gone',
      message: 'This plan endpoint is deprecated. Use /api/v1.1/subscription/plans.',
    };

    if (typeof ctx.send === 'function') {
      return ctx.send(body, 410);
    }

    ctx.status = 410;
    ctx.body = body;
    return body;
  },
};
