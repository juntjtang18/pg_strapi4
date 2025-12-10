'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
// UUID helper (works on Node 16/18+; falls back to uuid pkg if needed)
const crypto = require('crypto');
const uuidv4 = crypto.randomUUID ? () => crypto.randomUUID() : require('uuid').v4;
const { randomUUID } = require('crypto');

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------ content helpers ------------------

// Minimal clone for creation + guarantee pagebreaker.unit_uuid uniqueness
function cloneContentEnsureUUIDs(baseContent = []) {
  if (!Array.isArray(baseContent)) return [];

  const seen = new Set();

  return baseContent
    .map((item) => {
      const uid = item?.__component;
      if (!uid) return null;

      switch (uid) {
        case 'coursecontent.text':
          return { __component: uid, data: item.data ?? '', style: item.style ?? null };

        case 'coursecontent.quiz':
          return {
            __component: uid,
            question: item.question ?? '',
            options: item.options ?? null,
            correctAnswer: item.correctAnswer ?? '',
          };

        case 'coursecontent.image': {
          const imageId =
            item?.image_file?.id ??
            (Array.isArray(item?.image_file) ? item.image_file[0]?.id : null);
          return { __component: uid, image_file: imageId || null };
        }

        case 'coursecontent.video': {
          const videoId =
            item?.video_file?.id ??
            (Array.isArray(item?.video_file) ? item.video_file[0]?.id : null);
          const thumbId =
            item?.thumbnail?.id ??
            (Array.isArray(item?.thumbnail) ? item.thumbnail[0]?.id : null);
          return { __component: uid, video_file: videoId || null, thumbnail: thumbId || null };
        }

        case 'coursecontent.external-video':
          return { __component: uid, external_url: item.external_url ?? '', caption: item.caption ?? '' };

        case 'coursecontent.pagebreaker': {
          let id = (item.unit_uuid || '').trim();
          if (!id || seen.has(id)) id = uuidv4();
          seen.add(id);
          return {
            __component: uid,
            backbutton: typeof item.backbutton === 'boolean' ? item.backbutton : true,
            nextbutton: typeof item.nextbutton === 'boolean' ? item.nextbutton : true,
            unit_uuid: id,
          };
        }

        default:
          // Pass through unknown components as-is (defensive)
          return { __component: uid, ...item };
      }
    })
    .filter(Boolean);
}

// --- helpers ---
async function gptTranslateText(text, toLocale, fromLocale = 'en') {
  const to = toLocale === 'zh' ? 'zh-CN' : toLocale;
  const from = fromLocale === 'zh' ? 'zh-CN' : fromLocale;

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional translator. Output only the translation.' },
      { role: 'user', content: `Translate from ${from} to ${to}:\n\n${text || ''}` },
    ],
    temperature: 0.1,
  });
  return res.choices?.[0]?.message?.content?.trim() ?? '';
}

async function gptTranslateArrayOfStrings(arr, toLocale, fromLocale = 'en') {
  const to = toLocale === 'zh' ? 'zh-CN' : toLocale;
  const from = fromLocale === 'zh' ? 'zh-CN' : fromLocale;

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional translator. Return ONLY a JSON array of strings.' },
      { role: 'user', content: `Translate each string from ${from} to ${to} and return a JSON array:\n${JSON.stringify(arr || [])}` },
    ],
    temperature: 0.1,
  });

  const raw = res.choices?.[0]?.message?.content || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.array)) return parsed.array;
  } catch (_) {}
  try {
    const tryAgain = JSON.parse(raw.replace(/^[^{\[]+/, '').replace(/[^}\]]+$/, ''));
    return Array.isArray(tryAgain) ? tryAgain : [];
  } catch {
    return [];
  }
}


function normalizeContentForTranslate(baseContent = []) {
  if (!Array.isArray(baseContent)) return [];
  return baseContent
    .map((item) => {
      const uid = item.__component;
      if (!uid) return null;

      switch (uid) {
        case 'coursecontent.text':
          return {
            __component: uid,
            data: item.data ?? '',
            style: item.style ?? null,
            __needsTranslate: { text: true },
          };

        case 'coursecontent.quiz': {
          const optionsRaw = item.options;
          const optionsArray = Array.isArray(optionsRaw) ? optionsRaw.slice() : null;
          return {
            __component: uid,
            question: item.question ?? '',
            options: optionsRaw ?? null,
            correctAnswer: item.correctAnswer ?? '',
            __needsTranslate: { quiz: true, optionsArray },
          };
        }

        // For non-translated components, pass through unchanged.
        case 'coursecontent.image':
          return { __component: uid, image_file: item?.image_file?.id ?? null };

        case 'coursecontent.video':
          return {
            __component: uid,
            video_file: item?.video_file?.id ?? null,
            thumbnail: item?.thumbnail?.id ?? null,
          };

        case 'coursecontent.external-video':
          return { __component: uid, external_url: item.external_url ?? '', caption: item.caption ?? '' };

        case 'coursecontent.pagebreaker':
          return {
            __component: uid,
            backbutton: typeof item.backbutton === 'boolean' ? item.backbutton : true,
            nextbutton: typeof item.nextbutton === 'boolean' ? item.nextbutton : true,
            unit_uuid: item.unit_uuid ?? '',
          };

        default:
          return { __component: uid, ...item };
      }
    })
    .filter(Boolean);
}

async function translateContentArray(contentArr, toLocale, fromLocale = 'en') {
  const out = [];
  for (const block of contentArr) {
    const uid = block.__component;

    if (block.__needsTranslate?.text) {
      const translated = await gptTranslateText(block.data || '', toLocale, fromLocale);
      out.push({ __component: uid, data: translated, style: block.style ?? null });
      continue;
    }

    if (block.__needsTranslate?.quiz) {
      const questionTr = await gptTranslateText(block.question || '', toLocale, fromLocale);

      let optionsFinal = block.options;
      let correctFinal = block.correctAnswer ?? '';

      if (Array.isArray(block.__needsTranslate.optionsArray)) {
        const srcOptions = block.__needsTranslate.optionsArray;
        const trOptions = await gptTranslateArrayOfStrings(srcOptions, toLocale, fromLocale);
        const safeTr =
          Array.isArray(trOptions) && trOptions.length === srcOptions.length ? trOptions : srcOptions;

        const matchIdx = srcOptions.findIndex((o) => String(o) === String(correctFinal));
        if (matchIdx >= 0 && matchIdx < safeTr.length) {
          correctFinal = safeTr[matchIdx];
        }

        optionsFinal = safeTr;
      }

      out.push({
        __component: uid,
        question: questionTr,
        options: optionsFinal,
        correctAnswer: correctFinal,
      });
      continue;
    }

    // Pass through non-translated blocks untouched
    const { __needsTranslate, ...rest } = block;
    out.push(rest);
  }
  return out;
}


function normalizeContentForClone(baseContent = []) {
  if (!Array.isArray(baseContent)) return [];
  return baseContent
    .map((item) => {
      const uid = item.__component;
      if (!uid) return null;

      switch (uid) {
        case 'coursecontent.text':
          return { __component: uid, data: item.data ?? '', style: item.style ?? null };

        case 'coursecontent.quiz':
          return {
            __component: uid,
            question: item.question ?? '',
            options: item.options ?? null,
            correctAnswer: item.correctAnswer ?? '',
          };

        case 'coursecontent.image': {
          const imageId = item?.image_file?.id ?? (Array.isArray(item?.image_file) ? item.image_file[0]?.id : null);
          return { __component: uid, image_file: imageId || null };
        }

        case 'coursecontent.video': {
          const videoId = item?.video_file?.id ?? (Array.isArray(item?.video_file) ? item.video_file[0]?.id : null);
          const thumbId = item?.thumbnail?.id ?? (Array.isArray(item?.thumbnail) ? item.thumbnail[0]?.id : null);
          return { __component: uid, video_file: videoId || null, thumbnail: thumbId || null };
        }

        case 'coursecontent.external-video':
          return { __component: uid, external_url: item.external_url ?? '', caption: item.caption ?? '' };

        case 'coursecontent.pagebreaker':
          return {
            __component: uid,
            backbutton: typeof item.backbutton === 'boolean' ? item.backbutton : true,
            nextbutton: typeof item.nextbutton === 'boolean' ? item.nextbutton : true,
            unit_uuid: item.unit_uuid ?? '',
          };

        default:
          return { __component: uid, ...item };
      }
    })
    .filter(Boolean);
}

module.exports = createCoreController('api::course.course', ({ strapi }) => ({
  /**
   * POST /api/courses/:id/createlocale?locale=zh[&enforce=true]
   * - Forwards user's JWT
   * - Deep-copies ALL components (media -> IDs)
   * - Copies icon_image by media ID
   * - Robustly retrieves new ID (falls back to query if /localizations response lacks it)
   * - Does NOT copy non-localized 'order'
   */
  async createlocale(ctx) {
    const baseId = Number(ctx.params?.id ?? ctx.query?.id);
    if (!Number.isInteger(baseId)) return ctx.badRequest('Invalid course id.');

    const saveLocale = (ctx.query?.locale || 'zh').trim();
    const enforce = ctx.query?.enforce === 'true';

    strapi.log.info(`🟢 [CREATE LOCALE] baseId=${baseId}, saveLocale=${saveLocale}, enforce=${enforce}`);

    const base = await strapi.entityService.findOne('api::course.course', baseId, {
      populate: {
        localizations: true,
        icon_image: true,
        content: { populate: '*' },
      },
    });
    if (!base) return ctx.notFound(`Base course ${baseId} not found`);

    const existingLoc = Array.isArray(base.localizations)
      ? base.localizations.find((l) => l.locale === saveLocale)
      : null;

    // Deep-copy + ensure pagebreaker UUIDs
    const newContent = cloneContentEnsureUUIDs(base.content);

    const singleRelCopy = {
      ...(base.icon_image?.id ? { icon_image: base.icon_image.id } : { icon_image: null }),
    };

    const localizedPayload = {
      locale: saveLocale,
      title: base.title,   // localized
      content: newContent, // localized (deep-copied, UUID-safe)
      ...singleRelCopy,    // copy icon_image by ID
      // NOTE: do not copy 'order'
    };

    if (existingLoc && enforce) {
      await strapi.entityService.update('api::course.course', existingLoc.id, {
        data: localizedPayload,
      });
      const full = await strapi.entityService.findOne('api::course.course', existingLoc.id, {
        populate: { content: { populate: '*' }, icon_image: true },
      });
      ctx.body = full;
      return;
    }

    if (existingLoc && !enforce) {
      ctx.status = 409;
      ctx.body = { error: `Localization "${saveLocale}" already exists for course ${baseId}` };
      return;
    }

    // Relay user's auth to Strapi's built-in /localizations endpoint
    const serverUrl =
      strapi.config.get('server.url') ||
      `http://localhost:${strapi.config.get('server.port', 1337)}`;
    const userAuth = ctx.request.header['authorization'] || '';
    if (!userAuth) return ctx.unauthorized('Missing Authorization header');

    const res = await fetch(`${serverUrl}/api/courses/${baseId}/localizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: userAuth },
      body: JSON.stringify(localizedPayload),
    });

    const txt = await res.text();
    if (!res.ok) {
      ctx.status = res.status;
      try { ctx.body = JSON.parse(txt); } catch { ctx.body = txt; }
      return;
    }

    // Robust new-id extraction
    let newId = null;
    try {
      const created = JSON.parse(txt);
      newId =
        created?.data?.id ??
        created?.id ??
        (Array.isArray(created?.data) ? created.data[0]?.id : null);
    } catch (_) { /* ignore; fallback below */ }

    if (!newId) {
      // Fallback: query the new sibling by (locale + same localization set)
      const found = await strapi.entityService.findMany('api::course.course', {
        fields: ['id', 'locale'],
        filters: { locale: saveLocale, localizations: { id: baseId } },
        limit: 1,
      });
      newId = Array.isArray(found) && found[0]?.id ? found[0].id : null;
    }

    if (!newId) {
      ctx.status = 500;
      ctx.body = { error: 'Localization created but no ID returned and fallback lookup failed.' };
      return;
    }

    const finalLoc = await strapi.entityService.findOne('api::course.course', newId, {
      populate: { content: { populate: '*' }, icon_image: true },
    });
    ctx.body = finalLoc;
  },


/**
 * POST /api/courses/:id/translate?locale=zh[&source=en]
 * - Translates the existing record's content (assumed currently in `source` locale, default 'en')
 *   into `locale`.
 * - Translates: title, text blocks, quiz blocks (question/options/correctAnswer)
 * - Leaves non-translated components untouched
 * - Manual Authorization check (route uses auth:false)
 */
async translate(ctx) {
  const targetId = Number(ctx.params?.id);
  if (!Number.isInteger(targetId)) return ctx.badRequest('Invalid course id.');

  const targetLocale = (ctx.query?.locale || 'zh').trim();
  const sourceLocale = (ctx.query?.source || 'en').trim();

  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.translate] ▶️ start id=${targetId} ${sourceLocale} → ${targetLocale}`);

  // 1) Load the record to translate
  const course = await strapi.entityService.findOne('api::course.course', targetId, {
    populate: { content: { populate: '*' } },
  });
  if (!course) return ctx.notFound(`Course ${targetId} not found`);

  // 2) Translate title (source → target)
  const titleTr = await gptTranslateText(course.title || '', targetLocale, sourceLocale);

  // 3) Translate supported components (text, quiz)
  const normalized = normalizeContentForTranslate(course.content || []);
  const translatedContent = [];
  let idx = 0;

  for (const block of normalized) {
    idx += 1;
    const type = block.__component;

    if (block.__needsTranslate?.text) {
      const translated = await gptTranslateText(block.data || '', targetLocale, sourceLocale);
      translatedContent.push({ __component: type, data: translated, style: block.style ?? null });
      continue;
    }

    if (block.__needsTranslate?.quiz) {
      const questionTr = await gptTranslateText(block.question || '', targetLocale, sourceLocale);

      let optionsFinal = block.options;
      let correctFinal = block.correctAnswer ?? '';

      if (Array.isArray(block.__needsTranslate.optionsArray)) {
        const srcOptions = block.__needsTranslate.optionsArray;
        const trOptions = await gptTranslateArrayOfStrings(srcOptions, targetLocale, sourceLocale);
        const safeTr =
          Array.isArray(trOptions) && trOptions.length === srcOptions.length ? trOptions : srcOptions;

        const matchIdx = srcOptions.findIndex((o) => String(o) === String(correctFinal));
        if (matchIdx >= 0 && matchIdx < safeTr.length) {
          correctFinal = safeTr[matchIdx];
        }

        optionsFinal = safeTr;
      }

      translatedContent.push({
        __component: type,
        question: questionTr,
        options: optionsFinal,
        correctAnswer: correctFinal,
      });
      continue;
    }

    // Pass-through for non-translated components
    translatedContent.push(block);
  }

  // 4) Persist updates in-place (no new record)
  await strapi.entityService.update('api::course.course', targetId, {
    data: { title: titleTr, content: translatedContent },
  });

  // 5) Return updated record
  const updated = await strapi.entityService.findOne('api::course.course', targetId, {
    populate: { content: { populate: '*' } },
  });

  strapi.log.info(`[course.translate] ✅ done id=${targetId} ${sourceLocale} → ${targetLocale}`);
  ctx.body = updated;
},


async createlocaleAll(ctx) {
  const targetLocale = (ctx.query?.locale || 'zh').trim();
  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.createlocaleAll] start locale=${targetLocale}`);

  const enCourses = await strapi.entityService.findMany('api::course.course', {
    fields: ['id', 'locale', 'title'],
    filters: { locale: 'en' },
    populate: { localizations: { fields: ['id', 'locale'] } },
    limit: 10000,
  });

  const results = [];
  for (const course of enCourses) {
    const hasTarget = course.localizations?.some(l => l.locale === targetLocale);
    if (hasTarget) {
      results.push({ id: course.id, status: 'skipped' });
      continue;
    }

    try {
      // Call existing function directly
      const innerCtx = {
        params: { id: course.id },
        query: { locale: targetLocale },
        request: { header: { authorization: userAuth } },
      };
      await this.createlocale(innerCtx);
      results.push({ id: course.id, status: 'created' });
    } catch (err) {
      strapi.log.error(`[course.createlocaleAll] id=${course.id} failed: ${err.message}`);
      results.push({ id: course.id, status: 'error', error: err.message });
    }
  }

  ctx.body = { total: enCourses.length, results };
},

/**
 * POST /api/courses/reassigncat?locale=zh
 * For each EN course:
 *   - find zh sibling course
 *   - if zh course has no coursecategory:
 *       - read EN course's category
 *       - find zh sibling of that category
 *       - assign zh category to zh course
 * Only touches the coursecategory relation. Nothing else.
 */
async reassigncat(ctx) {
  const targetLocale = (ctx.query?.locale || 'zh').trim();

  // Manual JWT check since route uses auth:false
  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.reassigncat] ▶ start locale=${targetLocale}`);

  // 1) Load all EN courses with their localizations and EN category+its localizations
  const enCourses = await strapi.entityService.findMany('api::course.course', {
    fields: ['id', 'locale', 'title'],
    filters: { locale: 'en' },
    populate: {
      localizations: { fields: ['id', 'locale'] },               // to find zh course
      coursecategory: { populate: ['localizations'] },            // EN category + its siblings
    },
    limit: 10000,
  });

  if (!enCourses.length) {
    ctx.body = { total: 0, reassigned: 0, skipped: 0, failed: 0, results: [] };
    return;
  }

  let reassigned = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  // 2) Walk EN courses, operate on their zh sibling
  for (const en of enCourses) {
    try {
      // Find zh sibling course
      const zhSiblingMeta = Array.isArray(en.localizations)
        ? en.localizations.find(l => l.locale === targetLocale)
        : null;

      if (!zhSiblingMeta?.id) {
        skipped++;
        results.push({ enId: en.id, status: 'skipped', reason: `no ${targetLocale} course sibling` });
        continue;
      }

      // Load zh course with current category status (minimal)
      const zhCourse = await strapi.entityService.findOne('api::course.course', zhSiblingMeta.id, {
        populate: { coursecategory: { fields: ['id'] } },
      });

      // If zh already has category → skip
      if (zhCourse?.coursecategory?.id) {
        skipped++;
        results.push({ enId: en.id, zhId: zhCourse.id, status: 'skipped', reason: 'zh already has category' });
        continue;
      }

      // EN course must have category
      const enCat = en.coursecategory;
      if (!enCat?.id) {
        skipped++;
        results.push({ enId: en.id, zhId: zhCourse.id, status: 'skipped', reason: 'EN course has no category' });
        continue;
      }

      // Find zh sibling category
      const zhCat =
        Array.isArray(enCat.localizations) &&
        enCat.localizations.find(c => c.locale === targetLocale);

      if (!zhCat?.id) {
        skipped++;
        results.push({
          enId: en.id,
          zhId: zhCourse.id,
          status: 'skipped',
          reason: `no ${targetLocale} sibling for EN category ${enCat.id}`,
        });
        continue;
      }

      // Assign zh category to zh course
      await strapi.entityService.update('api::course.course', zhCourse.id, {
        data: { coursecategory: zhCat.id },
      });

      reassigned++;
      results.push({ enId: en.id, zhId: zhCourse.id, status: 'reassigned', categoryId: zhCat.id });
    } catch (err) {
      failed++;
      results.push({
        enId: en.id,
        status: 'error',
        error: err?.message || String(err),
      });
      strapi.log.error(`[course.reassigncat] failed enId=${en.id}: ${err?.message || err}`);
    }
  }

  const summary = { total: enCourses.length, reassigned, skipped, failed };
  strapi.log.info(`[course.reassigncat] ✅ done total=${summary.total} reassigned=${reassigned} skipped=${skipped} failed=${failed}`);
  ctx.body = { ...summary, results };
},
/**
 * POST /api/courses/translateall?locale=zh[&startid=97]
 * Translates ALL courses in target locale with id >= startid.
 * - Reuses translate() for each record
 * - Minimal key logs
 * - No batching; runs through all matching IDs in ascending order
 */
async translateAll(ctx) {
  const targetLocale = (ctx.query?.locale || 'zh').trim();
  const startId = Number(ctx.query?.startid || 0);

  // manual JWT check (route auth:false)
  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.translateAll] ▶ start locale=${targetLocale}, startid=${startId}`);

  // 1) Fetch ALL target-locale courses with id >= startId (ordered)
  const rows = await strapi.db.query('api::course.course').findMany({
    where: {
      locale: targetLocale,
      id: { $gte: startId },
    },
    select: ['id'],
    orderBy: { id: 'asc' },
    // no limit: process them all in one request as you asked
  });

  if (!rows.length) {
    strapi.log.info('[course.translateAll] nothing to process.');
    ctx.body = { total: 0, processed: 0, failed: 0, results: [] };
    return;
  }

  const results = [];
  let processed = 0;
  let failed = 0;
  const total = rows.length;

  let idx = 0;
  for (const { id } of rows) {
    idx += 1;
    try {
      if (idx === 1) strapi.log.info(`[course.translateAll] first id=${id}`);
      if (idx % 10 === 0) strapi.log.info(`[course.translateAll] progress ${idx}/${total} (id=${id})`);

      // call existing single-item translator
      const innerCtx = {
        params: { id },
        query:  { locale: targetLocale },
        request:{ header: { authorization: userAuth } },

        // minimal helpers used by translate()
        badRequest:   (m) => { const e = new Error(m || 'Bad Request');   e.status = 400; throw e; },
        notFound:     (m) => { const e = new Error(m || 'Not Found');     e.status = 404; throw e; },
        unauthorized: (m) => { const e = new Error(m || 'Unauthorized');  e.status = 401; throw e; },

        body: null,
        status: 200,
      };

      await this.translate(innerCtx);

      processed += 1;
      results.push({ id, status: 'translated' });
    } catch (err) {
      failed += 1;
      results.push({ id, status: 'error', error: err?.message || String(err) });
      strapi.log.error(`[course.translateAll] id=${id} ✗ ${err?.message || err}`);
    }
  }

  strapi.log.info(`[course.translateAll] ✅ done processed=${processed} failed=${failed} lastId=${rows[rows.length - 1].id}`);
  ctx.body = { total, processed, failed, startid: startId, lastId: rows[rows.length - 1].id, results };
},


/**
 * POST /api/courses/:id/backfill?source=zh&target=en
 * - Removes all components from target (en)
 * - Copies components from source (zh) sibling
 * - For pagebreaker: auto-generate new unit_uuid
 */
async backfill(ctx) {
  const baseId = Number(ctx.params?.id);
  if (!Number.isInteger(baseId)) return ctx.badRequest('Invalid course id.');

  const sourceLocale = (ctx.query?.source || 'zh').trim();
  const targetLocale = (ctx.query?.target || 'en').trim();

  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.backfill] ▶ start id=${baseId}, source=${sourceLocale}, target=${targetLocale}`);

  // 1️⃣ Load target (en) course
  const target = await strapi.entityService.findOne('api::course.course', baseId, {
    populate: { localizations: { fields: ['id', 'locale'] }, content: { populate: '*' } },
  });
  if (!target) return ctx.notFound(`Target course ${baseId} not found`);

  // 2️⃣ Find zh sibling
  const zhSibling = Array.isArray(target.localizations)
    ? target.localizations.find((l) => l.locale === sourceLocale)
    : null;

  if (!zhSibling?.id) return ctx.notFound(`No ${sourceLocale} sibling found for course ${baseId}`);

  const source = await strapi.entityService.findOne('api::course.course', zhSibling.id, {
    populate: { content: { populate: '*' } },
  });
  if (!source) return ctx.notFound(`Source course ${zhSibling.id} (${sourceLocale}) not found`);

  // 3️⃣ Clone components; assign uuid to each pagebreaker
  const cloned = (Array.isArray(source.content) ? source.content : []).map((item) => {
    const uid = item.__component;
    switch (uid) {
      case 'coursecontent.text':
        return { __component: uid, data: item.data ?? '', style: item.style ?? null };

      case 'coursecontent.quiz':
        return {
          __component: uid,
          question: item.question ?? '',
          options: item.options ?? null,
          correctAnswer: item.correctAnswer ?? '',
        };

      case 'coursecontent.image':
        return { __component: uid, image_file: item?.image_file?.id ?? null };

      case 'coursecontent.video':
        return {
          __component: uid,
          video_file: item?.video_file?.id ?? null,
          thumbnail: item?.thumbnail?.id ?? null,
        };

      case 'coursecontent.external-video':
        return { __component: uid, external_url: item.external_url ?? '', caption: item.caption ?? '' };

      case 'coursecontent.pagebreaker':
        return {
          __component: uid,
          backbutton: typeof item.backbutton === 'boolean' ? item.backbutton : true,
          nextbutton: typeof item.nextbutton === 'boolean' ? item.nextbutton : true,
          unit_uuid: randomUUID(), // ← new uuid generated here
        };

      default:
        return { __component: uid, ...item };
    }
  });

  // 4️⃣ Save cloned components into target
  await strapi.entityService.update('api::course.course', baseId, {
    data: { content: cloned },
  });

  // 5️⃣ Return updated record
  const updated = await strapi.entityService.findOne('api::course.course', baseId, {
    populate: { content: { populate: '*' } },
  });

  strapi.log.info(`[course.backfill] ✅ done id=${baseId}, from=${sourceLocale} → ${targetLocale}`);
  ctx.body = updated;
},


}));
