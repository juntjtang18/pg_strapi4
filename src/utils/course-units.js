'use strict';
const PB = 'coursecontent.pagebreaker';

async function getUnitUUIDs(courseId) {
  const entry = await strapi.entityService.findOne('api::course.course', courseId, {
    populate: {
      content: { on: { [PB]: { fields: ['unit_uuid'] } } }
    }
  });
  const dz = Array.isArray(entry?.content) ? entry.content : [];
  return dz.filter(b => b.__component === PB && b.unit_uuid).map(b => b.unit_uuid);
}

module.exports = { getUnitUUIDs };
