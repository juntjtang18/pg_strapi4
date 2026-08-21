'use strict';

function parseTaggedPillarId(text, allowedIds) {
  if (!text) return null;
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  const tagged = String(text).match(/PILLAR_ID\s*=\s*(\d+)/i);
  if (tagged) {
    const id = Number(tagged[1]);
    return allowed.has(id) ? id : null;
  }
  const trimmed = String(text).trim();
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return allowed.has(id) ? id : null;
  }
  return null;
}

module.exports = {
  parseTaggedPillarId,
};
