'use strict';

/**
 * Uses Google's unofficial translate endpoint.
 * @param {string} targetLang e.g. 'zh', 'fr'
 * @param {string} text
 * @returns {Promise<string>}
 */
module.exports = async function translateText(targetLang, text) {
  if (!text) return '';

  const chunks = chunkText(text, 4000);
  const out = [];

  for (const chunk of chunks) {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', targetLang);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', chunk);

    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);

    const data = await res.json();
    out.push((data?.[0] || []).map(seg => seg?.[0] ?? '').join(''));
  }

  return out.join('');
};

function chunkText(s, limit) {
  if (s.length <= limit) return [s];
  const parts = [];
  for (let i = 0; i < s.length; i += limit) parts.push(s.slice(i, i + limit));
  return parts;
}
