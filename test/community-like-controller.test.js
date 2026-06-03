'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('like controller overrides legacy Swift-compatible endpoints', () => {
  const source = readFileSync('src/api/like/controllers/like.js', 'utf8');

  assert.equal(source.includes('async find(ctx)'), true);
  assert.equal(source.includes('async create(ctx)'), true);
  assert.equal(source.includes('async delete(ctx)'), true);
  assert.equal(source.includes('requestedUserId(ctx)'), true);
  assert.equal(source.includes('requestedBodyUserId(ctx.request.body)'), true);
});

test('like controller uses JWT user as authority for legacy like operations', () => {
  const source = readFileSync('src/api/like/controllers/like.js', 'utf8');

  assert.equal(source.includes('getUserIdFromAuthHeader(ctx, strapi)'), true);
  assert.equal(source.includes('Cannot fetch likes for another user.'), true);
  assert.equal(source.includes('Cannot create a like for another user.'), true);
  assert.equal(source.includes('users_permissions_user: authUserId'), true);
});
