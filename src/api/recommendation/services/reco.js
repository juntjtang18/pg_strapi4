'use strict';
const { getUnitUUIDs } = require('../../../utils/course-units');

const SORT = [{ priority: 'desc' }, { personality_rank: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

async function getUnfinished(userId, limit = 3) {
  return strapi.entityService.findMany('api::course-progress.course-progress', {
    filters: { user: userId, status: { $ne: 'completed' } },
    sort: SORT,
    populate: { course: { populate: ['icon_image'] } },
    limit,
  });
}

// --- NEW: load personality recs from `recommend_courses`
async function getPersonalityRecs(userId) {
  const [profile] = await strapi.entityService.findMany('api::user-profile.user-profile', {
    filters: { users_permissions_user: userId },
    populate: {
      personality_result: {
        populate: {
          // your field name is recommend_courses (no “ed”)
          recommend_courses: { populate: { course: true } },
        },
      },
    },
    limit: 1,
  });

  const list = profile?.personality_result?.recommend_courses || [];

  // Normalize various shapes into { courseId, rank }
  const recs = list
    .map((r) => {
      const rank = r.rank ?? 999;
      const c = r.course;

      // course could be: { id } or number or { id, attributes } or { data: { id, attributes } }
      let courseId = null;
      if (!c) courseId = null;
      else if (typeof c === 'number') courseId = c;
      else if (typeof c?.id === 'number') courseId = c.id;
      else if (typeof c?.data?.id === 'number') courseId = c.data.id;

      return courseId ? { courseId, rank } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return recs;
}

async function ensureSeeded(userId) {
  const count = await strapi.entityService.count('api::course-progress.course-progress', {
    filters: { user: userId },
  });
  if (count > 0) return;

  const recs = await getPersonalityRecs(userId);

  if (recs.length) {
    for (const r of recs.slice(0, 3)) {
      const units = await getUnitUUIDs(r.courseId);
      await strapi.entityService.create('api::course-progress.course-progress', {
        data: {
          user: userId,
          course: r.courseId,
          status: 'queued',
          source: 'personality',
          personality_rank: r.rank,
          priority: 100,
          total_units: units.length,
          completed_units: 0,
        },
      });
    }
  }

  if (recs.length < 3) {
    const need = 3 - recs.length;
    const exclude = recs.map((r) => r.courseId);
    const more = await strapi.entityService.findMany('api::course.course', {
      sort: { order: 'asc' },
      filters: exclude.length ? { id: { $notIn: exclude } } : undefined,
      limit: need,
    });
    for (const c of more) {
      const units = await getUnitUUIDs(c.id);
      await strapi.entityService.create('api::course-progress.course-progress', {
        data: {
          user: userId,
          course: c.id,
          status: 'queued',
          source: 'system',
          priority: 10,
          total_units: units.length,
          completed_units: 0,
        },
      });
    }
  }
}

async function addPersonalityPicks(userId) {
  const recs = await getPersonalityRecs(userId);
  if (!recs.length) return;

  const existing = await strapi.entityService.findMany('api::course-progress.course-progress', {
    filters: { user: userId },
    populate: { course: true },
    fields: ['id', 'status', 'priority'],
  });
  const byCourse = new Map(existing.map((e) => [e.course.id, e]));

  for (const r of recs) {
    const cid = r.courseId;
    const found = byCourse.get(cid);
    if (!found) {
      const units = await getUnitUUIDs(cid);
      await strapi.entityService.create('api::course-progress.course-progress', {
        data: {
          user: userId,
          course: cid,
          status: 'queued',
          source: 'personality',
          personality_rank: r.rank,
          priority: 100,
          total_units: units.length,
          completed_units: 0,
        },
      });
    } else if (found.status !== 'completed' && found.priority < 100) {
      await strapi.entityService.update('api::course-progress.course-progress', found.id, {
        data: { source: 'personality', personality_rank: r.rank, priority: 100 },
      });
    }
  }
}

async function topUpIfNeeded(userId) {
  const unfinished = await getUnfinished(userId, 3);
  if (unfinished.length >= 3) return;

  const progressAll = await strapi.entityService.findMany('api::course-progress.course-progress', {
    filters: { user: userId },
    populate: { course: true },
    fields: ['id'],
  });
  const exclude = new Set(progressAll.map((p) => p.course.id));
  const need = 3 - unfinished.length;

  const more = await strapi.entityService.findMany('api::course.course', {
    sort: { order: 'asc' },
    filters: { id: { $notIn: Array.from(exclude) } },
    limit: need,
  });

  for (const c of more) {
    const units = await getUnitUUIDs(c.id);
    await strapi.entityService.create('api::course-progress.course-progress', {
      data: {
        user: userId,
        course: c.id,
        status: 'queued',
        source: 'system',
        priority: 10,
        total_units: units.length,
        completed_units: 0,
      },
    });
  }
}

async function allCoursesCount() {
  return strapi.entityService.count('api::course.course');
}
async function userCompletedCount(userId) {
  return strapi.entityService.count('api::course-progress.course-progress', {
    filters: { user: userId, status: 'completed' },
  });
}

module.exports = {
  getUnfinished,
  ensureSeeded,
  addPersonalityPicks,
  topUpIfNeeded,
  allCoursesCount,
  userCompletedCount,
};
