'use strict';

const {
  sendSubscriptionServiceError,
} = require('./subscription-service-client');

function getCourseCategoryName(course) {
  return (
    course?.coursecategory?.name ||
    course?.coursecategory?.data?.attributes?.name ||
    course?.attributes?.coursecategory?.data?.attributes?.name ||
    ''
  );
}

function isMembershipOnlyCourse(course) {
  const categoryName = getCourseCategoryName(course).trim().toLowerCase();
  return (
    categoryName === 'membership only' ||
    categoryName.includes('membership') ||
    categoryName.includes('member') ||
    categoryName.includes('会员')
  );
}

function sendEntitlementDenied(ctx, decision, message) {
  const status = decision?.reason === 'limit_exceeded' ? 429 : 403;
  const body = {
    error: 'EntitlementDenied',
    message,
    usage: decision,
  };

  if (typeof ctx.send === 'function') {
    return ctx.send(body, status);
  }

  ctx.status = status;
  ctx.body = body;
  return body;
}

async function consumeEntitlementUsage(ctx, {
  deniedMessage = 'Your current plan does not allow this action.',
  entitlementKey,
  fallbackMessage = 'Unable to verify subscription usage.',
  idempotencyKey,
  metadata,
  quantity = 1,
  userId,
}) {
  try {
    const body = {
      entitlementKey,
      metadata,
      quantity,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    const decision = await strapi.service('api::subscription.subscription').consumeUsageV11({
      body,
      userId,
    });

    if (decision?.allowed === false) {
      sendEntitlementDenied(ctx, decision, deniedMessage);
      return { allowed: false, decision };
    }

    return { allowed: true, decision };
  } catch (error) {
    sendSubscriptionServiceError(ctx, error, fallbackMessage);
    return { allowed: false, error };
  }
}

module.exports = {
  consumeEntitlementUsage,
  isMembershipOnlyCourse,
};
