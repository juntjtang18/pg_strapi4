'use strict';

/**
 * Course lifecycles
 * - Assign stable UUIDs to each page (coursecontent.pagebreaker)
 * - Fixes both missing and duplicate UUIDs
 * - Uses afterCreate/afterUpdate to persist when ORM re-materializes components
 * - Avoids recursion by guarding our own patch updates
 */

const crypto = require('crypto');
const uuidv4 = crypto.randomUUID ? () => crypto.randomUUID() : require('uuid').v4;

const PB = 'coursecontent.pagebreaker';

// Guard set to avoid re-entry when we patch our own record
const patchingIds = new Set();

/** Mutate the incoming payload (before* hooks) */
function assignOnPayload(data, phase = 'n/a') {
  const dz = data?.content;
  if (!Array.isArray(dz)) return { total: 0, assigned: 0, kept: 0, dupFixed: 0 };

  let total = 0, assigned = 0, kept = 0, dupFixed = 0;
  const seen = new Set();

  dz.forEach((block) => {
    if (!block || block.__component !== PB) return;
    total++;

    let id = block.unit_uuid;
    if (id && seen.has(id)) { dupFixed++; id = null; } // incoming duplicate → reassign
    if (!id) { id = uuidv4(); block.unit_uuid = id; assigned++; }
    else { kept++; }
    seen.add(id);
  });

  if (total) {
    strapi.log.info(`[course] ${phase}: pagebreakers total=${total} assigned=${assigned} kept=${kept} duplicatesFixed=${dupFixed}`);
  }
  return { total, assigned, kept, dupFixed };
}

/** Post-persist pass to ensure values are actually saved on component rows */
async function ensurePersisted(courseId, phase = 'n/a') {
  // Don’t re-enter if this afterUpdate was triggered by our own patch
  if (patchingIds.has(courseId)) {
    strapi.log.debug?.(`[course] ${phase}: skip (internal patch)`);
    return;
  }

  // Narrow populate: just the DZ pagebreaker instances (id + unit_uuid)
  const entry = await strapi.entityService.findOne('api::course.course', courseId, {
    populate: {
      content: {
        on: {
          [PB]: { fields: ['id', 'unit_uuid'] },
        },
      },
    },
  });

  const content = Array.isArray(entry?.content) ? [...entry.content] : [];
  if (!content.length) return;

  let total = 0, assigned = 0, kept = 0, dupFixed = 0, changed = false;
  const seen = new Set();

  content.forEach((block, idx) => {
    if (!block || block.__component !== PB) return;
    total++;

    let id = block.unit_uuid;
    if (id && seen.has(id)) { dupFixed++; id = null; } // persisted duplicate → reassign
    if (!id) {
      id = uuidv4();
      block.unit_uuid = id;
      assigned++;
      changed = true;
      strapi.log.debug?.(
        `[course] ${phase}: post-persist ASSIGNED unit_uuid=${id} at dzIndex=${idx}`
      );
    } else {
      kept++;
    }
    seen.add(id);
  });

  if (total) {
    strapi.log.info(
      `[course] ${phase}: post-persist total=${total} assigned=${assigned} kept=${kept} duplicatesFixed=${dupFixed} changed=${changed}`
    );
  }

  if (changed) {
    // Guard re-entry for the update we’re about to make
    patchingIds.add(courseId);
    try {
      await strapi.entityService.update('api::course.course', courseId, { data: { content } });
    } finally {
      patchingIds.delete(courseId);
    }
  }
}

module.exports = {
  async beforeCreate(event) {
    assignOnPayload(event.params.data, 'beforeCreate');
  },
  async beforeUpdate(event) {
    // If this update was triggered by our own patch, skip
    const id = event.params?.where?.id;
    if (id && patchingIds.has(id)) return;
    assignOnPayload(event.params.data, 'beforeUpdate');
  },
  async afterCreate(event) {
    await ensurePersisted(event.result.id, 'afterCreate');
  },
  async afterUpdate(event) {
    await ensurePersisted(event.result.id, 'afterUpdate');
  },
};
