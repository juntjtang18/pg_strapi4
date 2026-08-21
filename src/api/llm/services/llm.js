'use strict';

const { createLlm } = require('../../../utils/llm');
const { parseTaggedPillarId } = require('../../../utils/llm/parse-pillar');

module.exports = () => ({
  complete(input) {
    return createLlm().complete(input);
  },

  async classifyPillar({ question, pillars }) {
    const list = Array.isArray(pillars) ? pillars : [];
    const allowedIds = new Set(
      list.map((pillar) => Number(pillar && pillar.id)).filter((id) => Number.isFinite(id))
    );
    const pillarLines = list
      .map((pillar) => `${pillar.id} — ${pillar.name || 'Untitled'}`)
      .join('\n');

    const result = await createLlm().complete({
      system: [
        'You classify a parenting question into exactly one learning pillar.',
        'Reply with only this line and nothing else: PILLAR_ID=<id>',
      ].join(' '),
      prompt: `Pillars:\n${pillarLines}\n\nQuestion: "${String(question).trim()}"`,
      temperature: 0,
      maxTokens: 20,
    });

    return {
      ...result,
      pillarId: parseTaggedPillarId(result.text, allowedIds),
    };
  },
});
