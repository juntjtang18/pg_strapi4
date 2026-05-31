'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');

const {
  getAuthenticatedUserFromContext,
  isJwtError,
} = require('../src/utils/authenticated-user');
const controller = require('../src/api/subscription/controllers/subscription');
const legacyPlanRoutes = require('../src/api/plan/routes/plan-routes');
const legacySubscriptionRoutes = require('../src/api/subscription/routes/activation');
const routeConfig = require('../src/api/subscription/routes/v1_1');
const subscriptionServiceFactory = require('../src/api/subscription/services/subscription');
const {
  sendSubscriptionServiceError,
} = require('../src/utils/subscription-service-client');

function createCtx(options = {}) {
  const authorization = Object.prototype.hasOwnProperty.call(options, 'authorization')
    ? options.authorization
    : 'Bearer test-jwt';
  const body = options.body || {};
  const query = options.query || {};
  const ctx = {
    body: undefined,
    query,
    request: {
      body,
      header: authorization ? { authorization } : {},
    },
    status: undefined,
    internalServerError(message) {
      this.status = 500;
      this.body = { error: message };
      return this.body;
    },
    send(body, status) {
      this.status = status || this.status || 200;
      this.body = body;
      return body;
    },
    unauthorized(message) {
      this.status = 401;
      this.body = { error: message };
      return this.body;
    },
  };

  return ctx;
}

function installStrapiMock(subscriptionService) {
  global.strapi = {
    entityService: {
      async findOne() {
        return { id: 42 };
      },
    },
    log: {
      error() {},
      info() {},
    },
    plugin(name) {
      assert.equal(name, 'users-permissions');
      return {
        service(serviceName) {
          assert.equal(serviceName, 'jwt');
          return {
            async verify(token) {
              assert.equal(token, 'test-jwt');
              return { id: 42 };
            },
          };
        },
      };
    },
    service(uid) {
      assert.equal(uid, 'api::subscription.subscription');
      return subscriptionService;
    },
  };
}

test('v1.1 route file exposes the public client subscription endpoints', () => {
  const routes = routeConfig.routes.map((route) => ({
    auth: route.config.auth,
    handler: route.handler,
    method: route.method,
    path: route.path,
  }));

  assert.deepEqual(routes, [
    {
      auth: false,
      handler: 'subscription.plansV11',
      method: 'GET',
      path: '/v1.1/subscription/plans',
    },
    {
      auth: false,
      handler: 'subscription.meV11',
      method: 'GET',
      path: '/v1.1/subscription/me',
    },
    {
      auth: false,
      handler: 'subscription.verifyAppleV11',
      method: 'POST',
      path: '/v1.1/subscription/apple/verify',
    },
    {
      auth: false,
      handler: 'subscription.syncAppleV11',
      method: 'POST',
      path: '/v1.1/subscription/apple/sync',
    },
    {
      auth: false,
      handler: 'subscription.verifyGoogleV11',
      method: 'POST',
      path: '/v1.1/subscription/google/verify',
    },
    {
      auth: false,
      handler: 'subscription.checkUsageV11',
      method: 'POST',
      path: '/v1.1/subscription/usage/check',
    },
    {
      auth: false,
      handler: 'subscription.consumeUsageV11',
      method: 'POST',
      path: '/v1.1/subscription/usage/consume',
    },
  ]);
});

test('legacy subscription-facing routes remain unchanged', () => {
  assert.deepEqual(legacyPlanRoutes.routes.map((route) => ({
    auth: route.config.auth,
    handler: route.handler,
    method: route.method,
    path: route.path,
  })), [
    {
      auth: false,
      handler: 'plan.find',
      method: 'GET',
      path: '/plans',
    },
  ]);

  assert.deepEqual(legacySubscriptionRoutes.routes.map((route) => ({
    auth: route.config.auth,
    handler: route.handler,
    method: route.method,
    path: route.path,
  })), [
    {
      auth: false,
      handler: 'subscription.activate',
      method: 'POST',
      path: '/v1/subscriptions/activate',
    },
    {
      auth: false,
      handler: 'subscription.myActivePlan',
      method: 'GET',
      path: '/subscriptions/my-active-plan',
    },
  ]);
});

test('plansV11 proxies public plan catalog with locale', async () => {
  let received;
  installStrapiMock({
    async getPlanCatalogV11(input) {
      received = input;
      return { plans: [] };
    },
  });

  const ctx = createCtx({ authorization: undefined, query: { locale: 'zh_CN' } });
  await controller.plansV11(ctx);

  assert.deepEqual(received, { locale: 'zh_CN' });
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { plans: [] });
});

test('plansV11 forwards subscription-service error status and body', async () => {
  installStrapiMock({
    async getPlanCatalogV11() {
      const error = new Error('subscription service rejected request');
      error.isSubscriptionServiceError = true;
      error.status = 503;
      error.body = {
        error: 'Service Unavailable',
        message: 'subscription service unavailable',
      };
      throw error;
    },
  });

  const ctx = createCtx({ authorization: undefined });
  await controller.plansV11(ctx);

  assert.equal(ctx.status, 503);
  assert.deepEqual(ctx.body, {
    error: 'Service Unavailable',
    message: 'subscription service unavailable',
  });
});

test('meV11 requires auth and injects current Strapi user id', async () => {
  let received;
  installStrapiMock({
    async getUserEntitlementsV11(input) {
      received = input;
      return { strapiUserId: 42 };
    },
  });

  const ctx = createCtx({ query: { locale: 'en' } });
  await controller.meV11(ctx);

  assert.deepEqual(received, { locale: 'en', userId: 42 });
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { strapiUserId: 42 });
});

test('meV11 rejects missing bearer token before proxying', async () => {
  let proxied = false;
  installStrapiMock({
    async getUserEntitlementsV11() {
      proxied = true;
    },
  });

  const ctx = createCtx({ authorization: undefined });
  await controller.meV11(ctx);

  assert.equal(proxied, false);
  assert.equal(ctx.status, 401);
});

test('meV11 forwards protected subscription-service error status and body', async () => {
  installStrapiMock({
    async getUserEntitlementsV11() {
      const error = new Error('subscription service denied request');
      error.isSubscriptionServiceError = true;
      error.status = 409;
      error.body = {
        message: 'This Apple transaction has already been processed.',
      };
      throw error;
    },
  });

  const ctx = createCtx();
  await controller.meV11(ctx);

  assert.equal(ctx.status, 409);
  assert.deepEqual(ctx.body, {
    message: 'This Apple transaction has already been processed.',
  });
});

test('authenticated user helper rejects non-bearer authorization', async () => {
  installStrapiMock({});
  const ctx = createCtx({ authorization: 'Basic abc' });

  const user = await getAuthenticatedUserFromContext(ctx);

  assert.equal(user, null);
  assert.equal(ctx.status, 401);
  assert.deepEqual(ctx.body, { error: 'Missing or invalid authorization header.' });
});

test('authenticated user helper rejects tokens without user id', async () => {
  global.strapi = {
    entityService: {
      async findOne() {
        throw new Error('findOne should not be called');
      },
    },
    plugin() {
      return {
        service() {
          return {
            async verify() {
              return {};
            },
          };
        },
      };
    },
  };

  const ctx = createCtx();
  const user = await getAuthenticatedUserFromContext(ctx);

  assert.equal(user, null);
  assert.equal(ctx.status, 401);
  assert.deepEqual(ctx.body, { error: 'Invalid token: User ID not found.' });
});

test('authenticated user helper classifies JWT errors', () => {
  assert.equal(isJwtError({ name: 'JsonWebTokenError' }), true);
  assert.equal(isJwtError({ name: 'TokenExpiredError' }), true);
  assert.equal(isJwtError({ name: 'Error' }), false);
});

test('subscription error helper returns 500 for non-service errors', () => {
  let logged = false;
  global.strapi = {
    log: {
      error() {
        logged = true;
      },
    },
  };
  const ctx = createCtx();

  sendSubscriptionServiceError(ctx, new Error('network down'), 'fallback message');

  assert.equal(logged, true);
  assert.equal(ctx.status, 500);
  assert.deepEqual(ctx.body, { error: 'fallback message' });
});

test('verifyAppleV11 passes client receipt body with current user id', async () => {
  let received;
  installStrapiMock({
    async verifyApplePurchaseV11(input) {
      received = input;
      return { subscription: { id: 'sub_1' } };
    },
  });

  const body = { autoRenew: true, receipt: 'signed-jws' };
  const ctx = createCtx({ body, query: { locale: 'en' } });
  await controller.verifyAppleV11(ctx);

  assert.deepEqual(received, { body, locale: 'en', userId: 42 });
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { subscription: { id: 'sub_1' } });
});

test('verifyAppleV11 ignores client-supplied strapiUserId in favor of authenticated user', async () => {
  let received;
  installStrapiMock({
    async verifyApplePurchaseV11(input) {
      received = input;
      return { subscription: { id: 'sub_1' } };
    },
  });

  const body = { receipt: 'signed-jws', strapiUserId: 999 };
  const ctx = createCtx({ body, query: { locale: 'en' } });
  await controller.verifyAppleV11(ctx);

  assert.deepEqual(received, { body, locale: 'en', userId: 42 });
  assert.equal(ctx.status, 200);
});

test('syncAppleV11 passes client states body with current user id', async () => {
  let received;
  installStrapiMock({
    async syncAppleSubscriptionsV11(input) {
      received = input;
      return { subscriptions: [{ id: 'sub_1' }] };
    },
  });

  const body = {
    states: [
      {
        autoRenew: false,
        currentPeriodEnd: '2026-06-30T00:00:00.000Z',
        currentPeriodStart: '2026-05-30T00:00:00.000Z',
        isActive: true,
        productId: 'ca.geniusparentingai.basic.monthly',
      },
    ],
  };
  const ctx = createCtx({ body, query: { locale: 'zh_CN' } });
  await controller.syncAppleV11(ctx);

  assert.deepEqual(received, { body, locale: 'zh_CN', userId: 42 });
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { subscriptions: [{ id: 'sub_1' }] });
});

test('syncAppleV11 ignores client-supplied strapiUserId in favor of authenticated user', async () => {
  let received;
  installStrapiMock({
    async syncAppleSubscriptionsV11(input) {
      received = input;
      return { subscriptions: [] };
    },
  });

  const body = {
    states: [
      {
        autoRenew: true,
        currentPeriodEnd: '2026-06-30T00:00:00.000Z',
        currentPeriodStart: '2026-05-30T00:00:00.000Z',
        isActive: true,
        productId: 'ca.geniusparentingai.basic.monthly',
      },
    ],
    strapiUserId: 999,
  };
  const ctx = createCtx({ body });
  await controller.syncAppleV11(ctx);

  assert.deepEqual(received, { body, locale: undefined, userId: 42 });
  assert.equal(ctx.status, 200);
});

test('verifyGoogleV11 passes purchase token body with current user id', async () => {
  let received;
  installStrapiMock({
    async verifyGooglePurchaseV11(input) {
      received = input;
      return { subscription: { id: 'sub_google' } };
    },
  });

  const body = { purchaseToken: 'google-token' };
  const ctx = createCtx({ body, query: { locale: 'en' } });
  await controller.verifyGoogleV11(ctx);

  assert.deepEqual(received, { body, locale: 'en', userId: 42 });
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { subscription: { id: 'sub_google' } });
});

test('verifyGoogleV11 ignores client-supplied strapiUserId in favor of authenticated user', async () => {
  let received;
  installStrapiMock({
    async verifyGooglePurchaseV11(input) {
      received = input;
      return { subscription: { id: 'sub_google' } };
    },
  });

  const body = { purchaseToken: 'google-token', strapiUserId: 999 };
  const ctx = createCtx({ body });
  await controller.verifyGoogleV11(ctx);

  assert.deepEqual(received, { body, locale: undefined, userId: 42 });
  assert.equal(ctx.status, 200);
});

test('usage v1.1 endpoints proxy body with current user id', async () => {
  const received = [];
  installStrapiMock({
    async checkUsageV11(input) {
      received.push(['check', input]);
      return { allowed: true };
    },
    async consumeUsageV11(input) {
      received.push(['consume', input]);
      return { allowed: true, remaining: 9 };
    },
  });

  const body = {
    entitlementKey: 'ai.chat',
    idempotencyKey: 'test-key',
    quantity: 1,
  };

  const checkCtx = createCtx({ body });
  await controller.checkUsageV11(checkCtx);

  const consumeCtx = createCtx({ body });
  await controller.consumeUsageV11(consumeCtx);

  assert.deepEqual(received, [
    ['check', { body, userId: 42 }],
    ['consume', { body, userId: 42 }],
  ]);
  assert.equal(checkCtx.status, 200);
  assert.deepEqual(checkCtx.body, { allowed: true });
  assert.equal(consumeCtx.status, 200);
  assert.deepEqual(consumeCtx.body, { allowed: true, remaining: 9 });
});

test('subscription service v1.1 methods call gpa-subscription with internal secret', async (t) => {
  const originalRequest = axios.request;
  const originalBaseUrl = process.env.SUBSYS_BASE_URL;
  const originalSecret = process.env.SUBSCRIPTION_SERVICE_SECRET;
  const calls = [];

  process.env.SUBSYS_BASE_URL = 'http://subscription.internal/';
  process.env.SUBSCRIPTION_SERVICE_SECRET = 'internal-secret';
  global.strapi = { log: { error() {}, info() {} } };

  axios.request = async (options) => {
    calls.push(options);
    return { data: { ok: true } };
  };

  t.after(() => {
    axios.request = originalRequest;
    if (originalBaseUrl === undefined) {
      delete process.env.SUBSYS_BASE_URL;
    } else {
      process.env.SUBSYS_BASE_URL = originalBaseUrl;
    }

    if (originalSecret === undefined) {
      delete process.env.SUBSCRIPTION_SERVICE_SECRET;
    } else {
      process.env.SUBSCRIPTION_SERVICE_SECRET = originalSecret;
    }
  });

  const service = subscriptionServiceFactory({ strapi: global.strapi });
  await service.getPlanCatalogV11({ locale: 'zh_CN' });
  await service.getUserEntitlementsV11({
    locale: 'en',
    userId: 42,
  });
  await service.verifyApplePurchaseV11({
    body: { receipt: 'signed-jws', strapiUserId: 999 },
    locale: 'en',
    userId: 42,
  });
  await service.syncAppleSubscriptionsV11({
    body: {
      states: [
        {
          autoRenew: false,
          currentPeriodEnd: '2026-06-30T00:00:00.000Z',
          currentPeriodStart: '2026-05-30T00:00:00.000Z',
          isActive: true,
          productId: 'ca.geniusparentingai.basic.monthly',
        },
      ],
      strapiUserId: 999,
    },
    locale: 'zh_CN',
    userId: 42,
  });
  await service.verifyGooglePurchaseV11({
    body: { purchaseToken: 'google-token', strapiUserId: 999 },
    locale: 'en',
    userId: 42,
  });
  await service.checkUsageV11({
    body: { entitlementKey: 'ai.chat', quantity: 1 },
    userId: 42,
  });
  await service.consumeUsageV11({
    body: {
      entitlementKey: 'ai.chat',
      idempotencyKey: 'test-key',
      quantity: 1,
    },
    userId: 42,
  });

  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'http://subscription.internal/api/v1/plans');
  assert.deepEqual(calls[0].params, { locale: 'zh_CN' });
  assert.equal(calls[0].headers['x-subscription-service-secret'], 'internal-secret');

  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].url, 'http://subscription.internal/api/v1/users/42/entitlements');
  assert.deepEqual(calls[1].params, { locale: 'en' });

  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].url, 'http://subscription.internal/api/v1/purchases/apple/verify');
  assert.deepEqual(calls[2].params, { locale: 'en' });
  assert.deepEqual(calls[2].data, {
    receipt: 'signed-jws',
    strapiUserId: 42,
  });

  assert.equal(calls[3].method, 'POST');
  assert.equal(calls[3].url, 'http://subscription.internal/api/v1/purchases/apple/sync');
  assert.deepEqual(calls[3].params, { locale: 'zh_CN' });
  assert.deepEqual(calls[3].data, {
    states: [
      {
        autoRenew: false,
        currentPeriodEnd: '2026-06-30T00:00:00.000Z',
        currentPeriodStart: '2026-05-30T00:00:00.000Z',
        isActive: true,
        productId: 'ca.geniusparentingai.basic.monthly',
      },
    ],
    strapiUserId: 42,
  });

  assert.equal(calls[4].method, 'POST');
  assert.equal(calls[4].url, 'http://subscription.internal/api/v1/purchases/google/verify');
  assert.deepEqual(calls[4].params, { locale: 'en' });
  assert.deepEqual(calls[4].data, {
    purchaseToken: 'google-token',
    strapiUserId: 42,
  });

  assert.equal(calls[5].method, 'POST');
  assert.equal(calls[5].url, 'http://subscription.internal/api/v1/users/42/usage/check');
  assert.deepEqual(calls[5].data, {
    entitlementKey: 'ai.chat',
    quantity: 1,
  });

  assert.equal(calls[6].method, 'POST');
  assert.equal(calls[6].url, 'http://subscription.internal/api/v1/users/42/usage/consume');
  assert.deepEqual(calls[6].data, {
    entitlementKey: 'ai.chat',
    idempotencyKey: 'test-key',
    quantity: 1,
  });
});

test('legacy activation forwarding still calls the old subsystem endpoint shape', async (t) => {
  const originalPost = axios.post;
  const originalBaseUrl = process.env.SUBSYS_BASE_URL;
  const originalSecret = process.env.SUBSCRIPTION_SERVICE_SECRET;
  let call;

  process.env.SUBSYS_BASE_URL = 'http://legacy-subsys.internal';
  process.env.SUBSCRIPTION_SERVICE_SECRET = 'legacy-secret';
  global.strapi = {
    log: {
      debug() {},
      error() {},
      info() {},
    },
  };

  axios.post = async (url, data, options) => {
    call = { data, options, url };
    return { data: { ok: true } };
  };

  t.after(() => {
    axios.post = originalPost;
    if (originalBaseUrl === undefined) {
      delete process.env.SUBSYS_BASE_URL;
    } else {
      process.env.SUBSYS_BASE_URL = originalBaseUrl;
    }

    if (originalSecret === undefined) {
      delete process.env.SUBSCRIPTION_SERVICE_SECRET;
    } else {
      process.env.SUBSCRIPTION_SERVICE_SECRET = originalSecret;
    }
  });

  const service = subscriptionServiceFactory({ strapi: global.strapi });
  const result = await service.forwardActivationToSubsystem({
    receipt: 'legacy-receipt',
    userId: 42,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(call, {
    data: {
      receipt: 'legacy-receipt',
      userId: 42,
    },
    options: {
      headers: {
        Authorization: 'Bearer legacy-secret',
      },
    },
    url: 'http://legacy-subsys.internal/api/v1/verify-apple-purchase',
  });
});
