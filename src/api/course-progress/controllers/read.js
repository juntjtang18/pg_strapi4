'use strict';

const { ensureUnitUUIDs } = require('../../../utils/course-units');

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
  // POST /api/me/courses/:courseId/read
  async logAndUpdate(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const courseId = Number(ctx.params.courseId);
    const {
      unit_uuid,
      event_type = 'page_view',
      dwell_ms,
      session_id,
      event_id,
      client_ts,
    } = ctx.request.body?.data || {};

    if (!courseId || !unit_uuid) return ctx.badRequest('courseId and unit_uuid are required');

    // 1) append read log
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

    // 2) ensure progress row exists & totals are set
    const [prog] = await strapi.entityService.findMany('api::course-progress.course-progress', {
      filters: { user: userId, course: courseId },
      limit: 1,
    });

    let progressId = prog?.id;
    let total = prog?.total_units ?? 0;

    if (!progressId) {
      const units = await ensureUnitUUIDs(courseId);
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
    } else if (total === 0) {
      const units = await ensureUnitUUIDs(courseId);
      total = units.length;
      await strapi.entityService.update('api::course-progress.course-progress', progressId, {
        data: { user: userId, course: courseId, total_units: total },
      });
    }

    // 3) idempotent unit completion
    const existsUnit = await strapi.entityService.findMany(
      'api::course-unit-state.course-unit-state',
      { filters: { user: userId, course: courseId, unit_uuid }, limit: 1, fields: ['id'] }
    );

    if (!existsUnit.length) {
      await strapi.entityService.create('api::course-unit-state.course-unit-state', {
        data: { user: userId, course: courseId, unit_uuid, completed_at: new Date().toISOString() },
      });
    }

    // 4) recompute counters from unit-state (truth)
    const completed_units = await strapi.entityService.count(
      'api::course-unit-state.course-unit-state',
      { filters: { user: userId, course: courseId } }
    );

    const current = await strapi.entityService.findOne(
      'api::course-progress.course-progress',
      progressId
    );
    const totalForStatus = current?.total_units ?? total ?? 0;
    const status =
      totalForStatus > 0 && completed_units >= totalForStatus ? 'completed' : 'in_progress';

    const patch = {
      user: userId,
      course: courseId,
      current_unit_uuid: unit_uuid,
      completed_units,
      status,
      last_activity_at: new Date().toISOString(),
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    };

    await strapi.entityService.update('api::course-progress.course-progress', progressId, {
      data: patch,
    });

    // 5) return Strapi-shaped entity, with course populated
    const withCourse = await strapi.entityService.findOne(
      'api::course-progress.course-progress',
      progressId,
      { populate: { course: { populate: ['icon_image'] } } }
    );

    ctx.body = {
      data: {
        id: withCourse.id,
        attributes: {
          status: withCourse.status,
          source: withCourse.source,
          priority: withCourse.priority,
          personality_rank: withCourse.personality_rank,
          total_units: withCourse.total_units,
          completed_units: withCourse.completed_units,
          current_unit_uuid: withCourse.current_unit_uuid,
          last_activity_at: withCourse.last_activity_at,
          completed_at: withCourse.completed_at,
          createdAt: withCourse.createdAt,
          updatedAt: withCourse.updatedAt,
          percent:
            withCourse.total_units
              ? withCourse.completed_units / withCourse.total_units
              : 0,
          course: wrapCourse(withCourse.course),
        },
      },
    };
  },
};
