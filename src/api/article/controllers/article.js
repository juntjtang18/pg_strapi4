'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// Robust dynamic loader for free Google Translate libs.
// Works with @vitalets/google-translate-api and similar forks across ESM/CJS variants.
async function loadTranslator() {
  // If already cached, reuse
  if (global.__translatorFn) return global.__translatorFn;

  // Try primary package
  let mod;
  try {
    mod = await import('@vitalets/google-translate-api');
  } catch (_) {
    // Fallbacks if you switch libs (optional)
    try { mod = await import('google-translate-api-x'); } catch (_) {}
    if (!mod) throw new Error('Unable to load a translate library');
  }

  // Find the callable translate function under all common shapes
  const cand = [
    mod,
    mod && mod.default,
    mod && mod.translate,
  ].find(fn => typeof fn === 'function');

  if (!cand) {
    // Last resort: some builds export { default: { translate } }
    const nested = mod && mod.default && mod.default.translate;
    if (typeof nested === 'function') {
      global.__translatorFn = nested;
      return nested;
    }
    throw new Error('Translate function not found in module exports');
  }

  global.__translatorFn = cand;
  return cand;
}

module.exports = createCoreController('api::article.article', ({ strapi }) => ({
  /**
   * POST /api/articles/:id/trans?target_lang=zh[&enforce=true]
   */
  async trans(ctx) {
    const baseId = Number(ctx.params?.id ?? ctx.query?.id);
    const targetLang = (ctx.query?.target_lang || 'zh').trim();
    const enforce = ctx.query?.enforce === 'true';

    if (!Number.isInteger(baseId)) return ctx.badRequest('Invalid article id.');

    // Ensure locale exists in Strapi
    const locales = await strapi.plugin('i18n').service('locales').find();
    if (!locales.some(l => l.code === targetLang)) {
      return ctx.badRequest(`Locale "${targetLang}" not configured.`);
    }

    // Fetch base article (EN)
    const base = await strapi.entityService.findOne('api::article.article', baseId, {
      fields: ['id', 'locale', 'title', 'content'],
      populate: { localizations: true },
    });
    if (!base) return ctx.notFound(`Base article ${baseId} not found`);

    // Check for existing localization
    const existingLoc =
      Array.isArray(base.localizations) &&
      base.localizations.find(loc => loc.locale === targetLang);

    if (existingLoc && !enforce) {
      ctx.status = 409;
      ctx.body = { error: `Localization "${targetLang}" already exists for article ${baseId}` };
      return;
    }

    // ---- Translate title & content via free lib ----
    const from = 'en';
    const titleEn = base.title || '';
    const contentEn = base.content || '';

    let titleTr = '';
    let contentTr = '';
    try {
      const translate = await loadTranslator();
      if (titleEn) {
        const r1 = await translate(titleEn, { from, to: targetLang });
        titleTr = r1.text;
      }
      if (contentEn) {
        const r2 = await translate(contentEn, { from, to: targetLang });
        contentTr = r2.text;
      }
    } catch (e) {
      ctx.status = 502;
      ctx.body = { error: `Translation failed: ${e?.message || e}` };
      return;
    }

    const localizedData = { locale: targetLang, title: titleTr, content: contentTr };

    // Overwrite or create via Strapi’s official localizations endpoint
    if (existingLoc && enforce) {
      const updated = await strapi.entityService.update('api::article.article', existingLoc.id, { data: localizedData });
      ctx.body = updated;
      return;
    }

    const serverUrl =
      strapi.config.get('server.url') || `http://localhost:${strapi.config.get('server.port', 1337)}`;

    const res = await fetch(`${serverUrl}/api/articles/${baseId}/localizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.STRAPI_API_TOKEN ? { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` } : {}),
      },
      body: JSON.stringify(localizedData),
    });

    const text = await res.text();
    if (!res.ok) {
      ctx.status = res.status;
      try { ctx.body = JSON.parse(text); } catch { ctx.body = text; }
      return;
    }

    ctx.body = JSON.parse(text);
  },
}));
