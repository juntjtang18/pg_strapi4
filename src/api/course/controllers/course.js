'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- helpers ---
async function gptTranslateText(text, toLocale) {
  const target = toLocale === 'zh' ? 'zh-CN' : toLocale;
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional translator. Output only the translation.' },
      { role: 'user', content: `Translate to ${target}:\n\n${text || ''}` },
    ],
    temperature: 0.1,
  });
  return res.choices?.[0]?.message?.content?.trim() ?? '';
}

async function gptTranslateArrayOfStrings(arr, toLocale) {
  const target = toLocale === 'zh' ? 'zh-CN' : toLocale;
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional translator. Return ONLY JSON array of strings.' },
      { role: 'user', content: `Translate each string to ${target} and return a JSON array:\n${JSON.stringify(arr || [])}` },
    ],
    temperature: 0.1,
  });

  // Try to parse as array first; fall back to extracting array from any JSON-ish content
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

async function translateContentArray(contentArr, toLocale) {
  const out = [];
  for (const block of contentArr) {
    if (block.__needsTranslate?.text) {
      const translated = await gptTranslateText(block.data || '', toLocale);
      out.push({ __component: block.__component, data: translated, style: block.style ?? null });
      continue;
    }

    if (block.__needsTranslate?.quiz) {
      const questionTr = await gptTranslateText(block.question || '', toLocale);

      let optionsFinal = block.options;
      let correctFinal = block.correctAnswer ?? '';

      if (Array.isArray(block.__needsTranslate.optionsArray)) {
        const srcOptions = block.__needsTranslate.optionsArray;
        const trOptions = await gptTranslateArrayOfStrings(srcOptions, toLocale);
        const safeTr =
          Array.isArray(trOptions) && trOptions.length === srcOptions.length ? trOptions : srcOptions;

        const matchIdx = srcOptions.findIndex((o) => String(o) === String(correctFinal));
        if (matchIdx >= 0 && matchIdx < safeTr.length) {
          correctFinal = safeTr[matchIdx];
        }

        optionsFinal = safeTr;
      }

      out.push({
        __component: block.__component,
        question: questionTr,
        options: optionsFinal,
        correctAnswer: correctFinal,
      });
      continue;
    }

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

    const newContent = normalizeContentForClone(base.content);
    const singleRelCopy = {
      ...(base.icon_image?.id ? { icon_image: base.icon_image.id } : { icon_image: null }),
    };

    const localizedPayload = {
      locale: saveLocale,
      title: base.title,     // localized
      content: newContent,   // localized (deep-copied)
      ...singleRelCopy,      // copy icon_image by ID
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

    const serverUrl =
      strapi.config.get('server.url') ||
      `http://localhost:${strapi.config.get('server.port', 1337)}`;
    const userAuth = ctx.request.header['authorization'] || '';
    if (!userAuth) return ctx.unauthorized('Missing Authorization header');

    // Create localization (may or may not return { data: { id } } depending on custom lifecycles/response)
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

    // Try to read id from response; if missing, fall back to querying for the zh sibling we just created.
    let newId = null;
    try {
      const created = JSON.parse(txt);
      newId =
        created?.data?.id ??
        created?.id ??
        (Array.isArray(created?.data) ? created.data[0]?.id : null);
    } catch (_) {
      // ignore parse error; fallback query below
    }

    if (!newId) {
      // Fallback: query the newly created localization by (locale, localizations.id = baseId)
      const found = await strapi.entityService.findMany('api::course.course', {
        fields: ['id', 'locale'],
        filters: {
          locale: saveLocale,
          // ensure it's in the same localization set as the base
          localizations: { id: baseId },
        },
        limit: 1,
      });
      newId = Array.isArray(found) && found[0]?.id ? found[0].id : null;
    }

    if (!newId) {
      ctx.status = 500;
      ctx.body = { error: 'Localization created but no ID returned and fallback lookup failed.' };
      return;
    }

    const finalZh = await strapi.entityService.findOne('api::course.course', newId, {
      populate: { content: { populate: '*' }, icon_image: true },
    });
    ctx.body = finalZh;
  },
/**
 * POST /api/courses/:id/translate?locale=zh
 * - Translate the existing locale entry (id = zh record)
 * - Does NOT create a new entry
 * - Translates only: title, text component, quiz component
 * - Leaves everything else untouched
 * - Verifies user's Authorization token manually (auth:false in route)
 */
async translate(ctx) {
  const targetId = Number(ctx.params?.id);
  if (!Number.isInteger(targetId)) return ctx.badRequest('Invalid course id.');

  const targetLocale = (ctx.query?.locale || 'zh').trim();
  const userAuth = ctx.request.header['authorization'] || '';
  if (!userAuth) return ctx.unauthorized('Missing Authorization header');

  strapi.log.info(`[course.translate] ▶️ start translating course id=${targetId} → locale=${targetLocale}`);

  // 1️⃣ Load the target (zh) record
  const course = await strapi.entityService.findOne('api::course.course', targetId, {
    populate: { content: { populate: '*' } },
  });
  if (!course) return ctx.notFound(`Course ${targetId} not found`);

  // 2️⃣ Translate title
  strapi.log.info(`[course.translate] Translating title...`);
  const titleTr = await gptTranslateText(course.title || '', targetLocale);
  strapi.log.info(`[course.translate] Title done.`);

  // 3️⃣ Translate text + quiz components only
  const normalized = normalizeContentForTranslate(course.content || []);
  const translatedContent = [];
  let idx = 0;
  for (const block of normalized) {
    idx += 1;
    const type = block.__component;
    if (block.__needsTranslate?.text) {
      strapi.log.info(`[course.translate] [${idx}] text...`);
      const translated = await gptTranslateText(block.data || '', targetLocale);
      translatedContent.push({ __component: type, data: translated, style: block.style ?? null });
      continue;
    }

    if (block.__needsTranslate?.quiz) {
      strapi.log.info(`[course.translate] [${idx}] quiz...`);
      const questionTr = await gptTranslateText(block.question || '', targetLocale);

      let optionsFinal = block.options;
      let correctFinal = block.correctAnswer ?? '';

      if (Array.isArray(block.__needsTranslate.optionsArray)) {
        const srcOptions = block.__needsTranslate.optionsArray;
        const trOptions = await gptTranslateArrayOfStrings(srcOptions, targetLocale);
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

    // non-translated blocks pass through
    translatedContent.push(block);
  }

  // 4️⃣ Save translation updates (no new record creation)
  await strapi.entityService.update('api::course.course', targetId, {
    data: {
      title: titleTr,
      content: translatedContent,
    },
  });

  // 5️⃣ Return updated record
  const updated = await strapi.entityService.findOne('api::course.course', targetId, {
    populate: { content: { populate: '*' } },
  });

  strapi.log.info(`[course.translate] ✅ done id=${targetId}, locale=${targetLocale}`);
  ctx.body = updated;
},

}));
