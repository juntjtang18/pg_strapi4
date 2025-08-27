'use strict';
const { getUnitUUIDs } = require('../../../utils/course-units');

module.exports = {
  // POST /api/me/courses/:courseId/read
  async logAndUpdate(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const courseId = Number(ctx.params.courseId);
    const { unit_uuid, event_type = 'page_view', dwell_ms, session_id, event_id, client_ts } =
      ctx.request.body?.data || {};
    if (!courseId || !unit_uuid) return ctx.badRequest('courseId and unit_uuid are required');

    // (1) append log  — UID updated
    await strapi.entityService.create('api::course-read-log.course-read-log', {
      data: {
        user: userId,
        course: courseId,
        unit_uuid,
        event_type,
        dwell_ms,
        session_id,
        event_id,
        client_ts,
        server_ts: new Date().toISOString(),
      },
    });

    // (2) ensure progress row exists (unchanged)
    const [prog] = await strapi.entityService.findMany('api::course-progress.course-progress', {
      filters: { user: userId, course: courseId },
      limit: 1,
    });

    let progressId = prog?.id;
    let total = prog?.total_units ?? 0;
    if (!progressId) {
      const units = await getUnitUUIDs(courseId);
      total = units.length;
      const created = await strapi.entityService.create('api::course-progress.course-progress', {
        data: {
          user: userId,
          course: courseId,
          total_units: total,
          completed_units: 0,
          status: 'in_progress',
          source: 'system',
          priority: 10,
        },
      });
      progressId = created.id;
    }

    // (3) mark unit completion idempotently — UID updated
    const existsUnit = await strapi.entityService.findMany('api::course-unit-state.course-unit-state', {
      filters: { user: userId, course: courseId, unit_uuid },
      limit: 1,
      fields: ['id'],
    });

    let inc = 0;
    if (!existsUnit.length) {
      await strapi.entityService.create('api::course-unit-state.course-unit-state', {
        data: { user: userId, course: courseId, unit_uuid, completed_at: new Date().toISOString() },
      });
      inc = 1;
    }

    // (4) update progress counters (unchanged)
    const current = await strapi.entityService.findOne(
      'api::course-progress.course-progress',
      progressId
    );
    const completed_units = (current?.completed_units ?? 0) + inc;
    const status =
      completed_units >= (current?.total_units ?? total) && (current?.total_units ?? total) > 0
        ? 'completed'
        : 'in_progress';

    const patch = {
      current_unit_uuid: unit_uuid,
      completed_units,
      status,
      last_activity_at: new Date().toISOString(),
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    };

    const updated = await strapi.entityService.update(
      'api::course-progress.course-progress',
      progressId,
      { data: patch }
    );

    ctx.body = {
      data: {
        ...updated,
        percent: updated.total_units ? updated.completed_units / updated.total_units : 0,
      },
    };
  },
};
