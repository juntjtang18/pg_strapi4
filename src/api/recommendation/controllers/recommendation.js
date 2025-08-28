'use strict';

const reco = require('../services/reco');

// --- helpers: wrap relations/media in Strapi envelopes
const wrapMedia = (m) => (m ? { data: { id: m.id, attributes: { ...m } } } : { data: null });

const wrapCourse = (c) =>
  c
    ? {
        data: {
          id: c.id,
          attributes: {
            title: c.title,
            order: c.order,
            locale: c.locale,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            icon_image: wrapMedia(c.icon_image),
          },
        },
      }
    : { data: null };

module.exports = {
  async mine(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    // business logic unchanged
    await reco.ensureSeeded(userId);
    await reco.addPersonalityPicks(userId);
    await reco.topUpIfNeeded(userId);

    // get 3 unfinished with course + icon populated (service already does this)
    const rows = await reco.getUnfinished(userId, 3);

    const data = rows.map((r) => ({
      id: r.id,
      attributes: {
        status: r.status,
        source: r.source,
        priority: r.priority,
        personality_rank: r.personality_rank,
        total_units: r.total_units,
        completed_units: r.completed_units,
        current_unit_uuid: r.current_unit_uuid,
        last_activity_at: r.last_activity_at,
        completed_at: r.completed_at,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        // computed field is OK to include; clients ignore unknown keys
        percent: r.total_units ? r.completed_units / r.total_units : 0,
        course: wrapCourse(r.course),
      },
    }));

    const allCompleted =
      (await reco.userCompletedCount(userId)) >= (await reco.allCoursesCount());

    // optional pagination meta for consistency
    const pageSize = 3;
    ctx.body = {
      data,
      meta: {
        allCompleted,
        pagination: {
          page: 1,
          pageSize,
          pageCount: 1,
          total: data.length,
        },
      },
    };
  },
};
