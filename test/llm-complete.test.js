'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMessages } = require('../src/utils/llm/openai-adapter');
const { parseTaggedPillarId } = require('../src/utils/llm/parse-pillar');

test('buildMessages accepts system + prompt', () => {
  const messages = buildMessages({
    system: 'Reply with an id.',
    prompt: 'kid is depressed',
  });
  assert.deepEqual(messages, [
    { role: 'system', content: 'Reply with an id.' },
    { role: 'user', content: 'kid is depressed' },
  ]);
});

test('parseTaggedPillarId reads PILLAR_ID and rejects unknown ids', () => {
  const allowed = new Set([1, 2, 5]);
  assert.equal(parseTaggedPillarId('PILLAR_ID=2', allowed), 2);
  assert.equal(parseTaggedPillarId('2', allowed), 2);
  assert.equal(parseTaggedPillarId('PILLAR_ID=9', allowed), null);
  assert.equal(parseTaggedPillarId('I think sleep is hard', allowed), null);
});
