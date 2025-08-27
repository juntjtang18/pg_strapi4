'use strict';

module.exports = {
  async beforeCreate(e) {
    await normalize(e.params.data, true);
  },
  async beforeUpdate(e) {
    await normalize(e.params.data, false, e.params.where?.id);
  },
};

async function normalize(data, isCreate, updatingId) {
  const userId = data.user?.id ?? data.user;
  const courseId = data.course?.id ?? data.course;
  if (!userId || !courseId) throw new Error('user & course are required');

  // Enforce one row per (user, course)
  const existing = await strapi.entityService.findMany('api::course-progress.course-progress', {
    filters: { user: userId, course: courseId },
    fields: ['id'],
    limit: 1,
  });

  if (isCreate && existing.length) throw new Error('Progress already exists for this user & course.');
  if (!isCreate && existing.length && existing[0].id !== updatingId) {
    throw new Error('Progress already exists for this user & course.');
  }

  // Default priority (coarse ordering)
  if (data.source === 'personality') data.priority ??= 100;
  else if (data.source === 'default') data.priority ??= 50;
  else data.priority ??= 10;

  // Auto-complete guard
  const total = Number(data.total_units ?? 0);
  const done = Number(data.completed_units ?? 0);
  if (total > 0 && done >= total) {
    data.status = 'completed';
    data.completed_at ??= new Date().toISOString();
  }
}
