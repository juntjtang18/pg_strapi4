'use strict';

const { getUnitUUIDs } = require('../../../../utils/course-units');

// normalize to numeric id (accepts number or { id } or { connect })
const ensureIntId = (val) => {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'object') return val;
  if (typeof val.id === 'number') return val.id;
  if (typeof val.connect === 'number') return val.connect;
  if (Array.isArray(val.connect) && typeof val.connect[0] === 'number') return val.connect[0];
  return val;
};

module.exports = {
  async beforeCreate(event) {
    await normalize(event, true);
  },
  async beforeUpdate(event) {
    await normalize(event, false);
  },
};

async function normalize(event, isCreate) {
  const data = event.params.data || {};
  const updatingId = event.params.where?.id;

  // Normalize incoming relation ids if provided
  if ('user' in data)   data.user   = ensureIntId(data.user);
  if ('course' in data) data.course = ensureIntId(data.course);

  // Resolve current ids
  let userId   = data.user;
  let courseId = data.course;

  // On update, if not provided in payload, read the existing row to fill them
  if (!isCreate && (!userId || !courseId) && updatingId) {
    const existing = await strapi.entityService.findOne(
      'api::course-progress.course-progress',
      updatingId,
      { populate: { user: true, course: true } }
    );
    if (!existing) throw new Error('course-progress not found');
    if (!userId)   userId   = existing.user?.id;
    if (!courseId) courseId = existing.course?.id;
  }

  // Only require relations on create, or when caller tries to change them
  const relationsTouched = isCreate || ('user' in data) || ('course' in data);
  if (relationsTouched && (!userId || !courseId)) {
    throw new Error('user & course are required');
  }

  // Enforce one row per (user, course) only when we have both ids and relations are touched
  if (relationsTouched && userId && courseId) {
    const dup = await strapi.entityService.findMany('api::course-progress.course-progress', {
      filters: { user: userId, course: courseId },
      fields: ['id'],
      limit: 1,
    });
    if (isCreate && dup.length) {
      throw new Error('Progress already exists for this user & course.');
    }
    if (!isCreate && dup.length && dup[0].id !== updatingId) {
      throw new Error('Progress already exists for this user & course.');
    }
  }

  // Default priority by source (keep your mapping)
  if (data.source === 'personality') data.priority ??= 100;
  else if (data.source === 'default') data.priority ??= 50;
  else if (!('priority' in data)) data.priority = 10;

  // Compute total_units when needed:
  // - create
  // - course changed
  // - total_units missing/<=0
  const needUnits =
    isCreate ||
    ('course' in data && data.course) ||
    typeof data.total_units !== 'number' ||
    data.total_units <= 0;

  if (needUnits && (courseId || data.course)) {
    const cid = courseId || data.course;
    const uuids = await getUnitUUIDs(cid);
    data.total_units = uuids.length;
  }

  // Initialize completed_units on create
  if (isCreate && !('completed_units' in data)) {
    data.completed_units = 0;
  }

  // Auto-complete guard
  const total = Number(data.total_units ?? 0);
  const done  = Number(data.completed_units ?? 0);
  if (total > 0 && done >= total) {
    data.status = 'completed';
    data.completed_at ??= new Date();
  }

  // Touch last activity unless caller set it explicitly
  if (!('last_activity_at' in data)) {
    data.last_activity_at = new Date();
  }

  // Write back normalized payload
  event.params.data = data;
}
