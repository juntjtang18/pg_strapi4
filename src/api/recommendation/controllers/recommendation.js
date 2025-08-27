'use strict';
const svc = require('../services/reco');

module.exports = {
  async mine(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    await svc.ensureSeeded(userId);
    await svc.addPersonalityPicks(userId);
    await svc.topUpIfNeeded(userId);

    const rows = await svc.getUnfinished(userId, 3);
    const total = await svc.allCoursesCount();
    const completed = await svc.userCompletedCount(userId);
    const allCompleted = total > 0 && completed >= total;

    const data = rows.map(r => ({
      ...r,
      percent: r.total_units ? r.completed_units / r.total_units : 0,
    }));

    ctx.body = { data, meta: { allCompleted } };
  },
};
