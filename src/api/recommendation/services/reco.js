'use strict';
const { getUnitUUIDs } = require('../../../utils/course-units');

// Priority semantics used across your codebase:
// - higher number = higher priority (personality = 100, system = 10)
const PRIO_PROMOTED = 100; // promote new personality picks to top
const PRIO_DEMOTED  = 10;  // demote old queued personality picks (same as "system"-level)
const RANK_DEMOTED  = 999;

// Keep for any server-side sort you might use elsewhere
const SORT = [{ priority: 'desc' }, { personality_rank: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

// --- Personality change resync (called by user-profile lifecycles) ---
async function resyncForPersonalityChangeSimple(userId, newPrId) {
  strapi.log.info(`[reco] resync start user=${userId} pr=${newPrId}`);

  // 1) DEMOTE existing queued personality picks — do it by IDs to avoid relation filters in UPDATE
  try {
    const toDemote = await strapi.db.query('api::course-progress.course-progress').findMany({
      where: { user: userId, source: 'personality', status: 'queued' },
      select: ['id'],
    });

    const demoteIds = toDemote.map(r => r.id);
    strapi.log.info(`[reco] demote queued personality rows count=${demoteIds.length}`);

    if (demoteIds.length) {
      await strapi.db.query('api::course-progress.course-progress').updateMany({
        where: { id: { $in: demoteIds } },
        data:  { priority: PRIO_DEMOTED, personality_rank: RANK_DEMOTED },
      });
    }
  } catch (e) {
    // Log and continue; demotion failure shouldn't block reseeding
    strapi.log.error(`[reco] demote step failed: ${e.message}`);
  }

  // 2) LOAD new personality picks
  const pr = await strapi.entityService.findOne(
    'api::personality-result.personality-result',
    newPrId,
    { populate: { recommend_courses: { populate: ['course'] } } }
  );

  const picks = (pr?.recommend_courses || [])
    .map(rc => ({ rank: rc.rank ?? 999, courseId: rc.course?.id }))
    .filter(p => p.courseId);

  strapi.log.info(`[reco] new picks=${picks.length} → ${picks.map(p => `${p.courseId}(r${p.rank})`).join(', ')}`);

  // 3) PROMOTE/UPSERT new picks
  for (const { rank, courseId } of picks) {
    const existing = await strapi.db.query('api::course-progress.course-progress').findOne({
      where: { user: userId, course: courseId },
    });

    if (existing) {
      if (existing.status !== 'completed') {
        await strapi.db.query('api::course-progress.course-progress').update({
          where: { id: existing.id },
          data:  { source: 'personality', priority: PRIO_PROMOTED, personality_rank: rank },
        });
        strapi.log.info(`[reco] promoted existing cp#${existing.id} course=${courseId} rank=${rank}`);
      } else {
        strapi.log.info(`[reco] skip completed course=${courseId}`);
      }
    } else {
      const units = await getUnitUUIDs(courseId); // your helper
      await strapi.entityService.create('api::course-progress.course-progress', {
        data: {
          user: userId,
          course: courseId,
          source: 'personality',
          priority: PRIO_PROMOTED,
          personality_rank: rank,
          status: 'queued',
          total_units: units.length,
          completed_units: 0,
        },
      });
      strapi.log.info(`[reco] created new cp for course=${courseId} units=${units.length} rank=${rank}`);
    }
  }

  strapi.log.info(`[reco] resync complete user=${userId} pr=${newPrId} picks=${picks.length}`);
}

// --- Used by /api/my-recommend-course ---
async function getUnfinished(userId, limit = 3) {
  // Fetch more than we need; precise sort in memory
  const rows = await strapi.entityService.findMany('api::course-progress.course-progress', {
    filters: { user: userId, status: { $in: ['queued', 'in_progress'] } },
    populate: { course: { populate: ['icon_image'] } },
    sort: [{ updatedAt: 'desc' }],
    limit: 100,
  });

  // In-progress first, then priority DESC (higher number first),
  // then rank ASC (1..n), then updatedAt DESC
  const sorted = rows.sort((a, b) => {
    const aIn = a.status === 'in_progress', bIn = b.status === 'in_progress';
    if (aIn !== bIn) return bIn - aIn;

    const ap = a.priority ?? 0, bp = b.priority ?? 0;
    if (ap !== bp) return bp - ap; // DESC

    const ar = a.personality_rank ?? RANK_DEMOTED, br = b.personality_rank ?? RANK_DEMOTED;
    if (ar !== br) return ar - br; // ASC

    return new Date(b.updatedAt) - new Date(a.updatedAt); // DESC
  });

  return sorted.slice(0, limit);
}

// --- Load personality recs from recommend_courses ---
async function getPersonalityRecs(userId) {
  const [profile] = await strapi.entityService.findMany('api::user-profile.user-profile', {
    filters: { users_permissions_user: userId },
    populate: {
      personality_result: {
        populate: {
          recommend_courses: { populate: { course: true } },
        },
      },
    },
    limit: 1,
  });

  const list = profile?.personality_result?.recommend_courses || [];

  const recs = list
    .map((r) => {
      const rank = r.rank ?? 999;
      const c = r.course;
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
          priority: PRIO_PROMOTED, // 100
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
          priority: PRIO_DEMOTED, // 10
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
          priority: PRIO_PROMOTED, // 100
          total_units: units.length,
          completed_units: 0,
        },
      });
    } else if (found.status !== 'completed' && (found.priority ?? 0) < PRIO_PROMOTED) {
      await strapi.entityService.update('api::course-progress.course-progress', found.id, {
        data: { source: 'personality', personality_rank: r.rank, priority: PRIO_PROMOTED },
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
        priority: PRIO_DEMOTED, // 10
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
  // exported API
  resyncForPersonalityChangeSimple,
  getUnfinished,
  ensureSeeded,
  addPersonalityPicks,
  topUpIfNeeded,
  allCoursesCount,
  userCompletedCount,

  // expose constants if you want to reuse them elsewhere
  PRIO_PROMOTED,
  PRIO_DEMOTED,
  RANK_DEMOTED,
  SORT,
};
