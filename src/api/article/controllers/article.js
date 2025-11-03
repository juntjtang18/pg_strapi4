'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// ---- SIMPLE, WORKING TRANSLATOR LOADER ----
async function loadTranslator() {
  if (global.__translatorFn) return global.__translatorFn;
  const translate = require('@iamtraction/google-translate');
  global.__translatorFn = async (text, { from, to }) => {
    const res = await translate(text, { from, to });
    return { text: res.text };
  };
  return global.__translatorFn;
}



module.exports = createCoreController('api::article.article', ({ strapi }) => ({

  /**
   * POST /api/articles/:id/trans?target_lang=zh[&enforce=true]
   */
async trans(ctx) {
  const baseId = Number(ctx.params?.id ?? ctx.query?.id);
  if (!Number.isInteger(baseId)) return ctx.badRequest('Invalid article id.');

  // Strapi locale to SAVE under (your scheme stays 'zh')
  const saveLocale = (ctx.query?.target_lang || 'zh').trim();
  const enforce = ctx.query?.enforce === 'true';

  strapi.log.info(`🟢 [TRANS] baseId=${baseId}, saveLocale=${saveLocale}, enforce=${enforce}`);

  // translator wants zh-CN but Strapi keeps 'zh'
  const translateLang = saveLocale === 'zh' ? 'zh-CN' : saveLocale;

  // Fetch base article WITH relations we’ll copy
  const base = await strapi.entityService.findOne('api::article.article', baseId, {
    populate: ['localizations', 'functions', 'categories', 'users_permissions_user', 'icon_image'],
  });
  if (!base) return ctx.notFound(`Base article ${baseId} not found`);

  // Check existing localization in Strapi for 'saveLocale'
  const existingLoc = Array.isArray(base.localizations)
    ? base.localizations.find(l => l.locale === saveLocale)
    : null;

  if (existingLoc && !enforce) {
    ctx.status = 409;
    ctx.body = { error: `Localization "${saveLocale}" already exists for article ${baseId}` };
    return;
  }

  // ---- Translate title & content only (decoupled from Strapi locale) ----
  const titleEn = base.title || '';
  const contentEn = base.content || '';
  let titleTr = '';
  let contentTr = '';
  try {
    const translate = await loadTranslator();
    if (titleEn) titleTr = (await translate(titleEn, { from: 'en', to: translateLang })).text;
    if (contentEn) contentTr = (await translate(contentEn, { from: 'en', to: translateLang })).text;
  } catch (e) {
    ctx.status = 502;
    ctx.body = { error: `Translation failed: ${e?.message || e}` };
    return;
  }

  // Non-localized primitives copied from base
  const primitiveCopy = {
    like_count: base.like_count,
    visit_count: base.visit_count,
    always_on_top: base.always_on_top,
    sortScore: base.sortScore,
    create_time: base.create_time,
    // 'published' is localized in your schema; do NOT copy it
  };

  // M2O / media copied by id
  const singleRelCopy = {
    ...(base.users_permissions_user?.id ? { users_permissions_user: base.users_permissions_user.id } : { users_permissions_user: null }),
    ...(base.icon_image?.id ? { icon_image: base.icon_image.id } : { icon_image: null }),
  };

  // Build M2M connect payloads
  const functionsConnect = base.functions?.length
    ? { functions: { set: [], connect: base.functions.map(f => ({ id: f.id })) } }
    : { functions: { set: [] } };

  const categoriesConnect = base.categories?.length
    ? { categories: { set: [], connect: base.categories.map(c => ({ id: c.id })) } }
    : { categories: { set: [] } };

  // ==========================
  // Overwrite existing zh (enforce=true)
  // ==========================
  if (existingLoc && enforce) {
    // 1) update localized fields + primitives + single relations
    await strapi.entityService.update('api::article.article', existingLoc.id, {
      data: {
        locale: saveLocale,
        title: titleTr,
        content: contentTr,
        ...primitiveCopy,
        ...singleRelCopy,
      },
    });

    // 2) force-connect M2M relations
    await strapi.entityService.update('api::article.article', existingLoc.id, {
      data: {
        ...functionsConnect,
        ...categoriesConnect,
      },
    });

    const updated = await strapi.entityService.findOne('api::article.article', existingLoc.id, { populate: ['functions', 'categories'] });
    ctx.body = updated;
    return;
  }

  // ==========================
  // Create new zh localization
  // ==========================
  // Use Strapi's official localizations endpoint to link localization set
  const serverUrl = strapi.config.get('server.url') || `http://localhost:${strapi.config.get('server.port', 1337)}`;
  const res = await fetch(`${serverUrl}/api/articles/${baseId}/localizations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.STRAPI_API_TOKEN ? { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({ locale: saveLocale, title: titleTr, content: contentTr }),
  });

  const text = await res.text();
  if (!res.ok) {
    ctx.status = res.status;
    try { ctx.body = JSON.parse(text); } catch { ctx.body = text; }
    return;
  }

  const created = JSON.parse(text);
  const newId = created?.data?.id;
  if (!newId) {
    ctx.status = 500;
    ctx.body = { error: 'Localization created but no ID returned.' };
    return;
  }

  // 1) update primitives + single relations
  await strapi.entityService.update('api::article.article', newId, {
    data: {
      ...primitiveCopy,
      ...singleRelCopy,
    },
  });

  // 2) force-connect M2M relations
  await strapi.entityService.update('api::article.article', newId, {
    data: {
      ...functionsConnect,
      ...categoriesConnect,
    },
  });

  // return new localized entry (with relations)
  const finalZh = await strapi.entityService.findOne('api::article.article', newId, { populate: ['functions', 'categories'] });
  ctx.body = finalZh;
},

  /**
   * POST /api/articles/transall?target_lang=zh[&enforce=true]
   */
  async transAll(ctx) {
    const targetLang = (ctx.query?.target_lang || 'zh').trim();
    const enforce = ctx.query?.enforce === 'true';
    const serverUrl =
      strapi.config.get('server.url') ||
      `http://localhost:${strapi.config.get('server.port', 1337)}`;

    const articles = await strapi.entityService.findMany('api::article.article', {
      fields: ['id'],
      filters: { locale: 'en' },
      limit: 9999,
    });

    if (!articles.length) {
      ctx.body = { message: 'No base articles found.' };
      return;
    }

    const results = [];
    for (const art of articles) {
      try {
        const res = await fetch(
          `${serverUrl}/api/articles/${art.id}/trans?target_lang=${encodeURIComponent(
            targetLang
          )}${enforce ? '&enforce=true' : ''}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.STRAPI_API_TOKEN
                ? { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` }
                : {}),
            },
          }
        );

        const txt = await res.text();
        const parsed = (() => { try { return JSON.parse(txt); } catch { return { raw: txt }; } })();
        results.push({ id: art.id, status: res.status, ok: res.ok, result: parsed });
      } catch (e) {
        results.push({ id: art.id, ok: false, error: e.message });
      }
    }

    ctx.body = {
      count: results.length,
      translated: results.filter(r => r.ok).length,
      errors: results.filter(r => !r.ok),
      details: results,
    };
  },
}));
