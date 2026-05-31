'use strict';

function isJwtError(error) {
  return error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError';
}

async function getAuthenticatedUserFromContext(ctx) {
  const authHeader = ctx.request.header.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.unauthorized('Missing or invalid authorization header.');
    return null;
  }

  const token = authHeader.split(' ')[1];
  const { id: userId } = await strapi.plugin('users-permissions').service('jwt').verify(token);
  if (!userId) {
    ctx.unauthorized('Invalid token: User ID not found.');
    return null;
  }

  const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
  if (!user) {
    ctx.unauthorized('User not found for this token.');
    return null;
  }

  return user;
}

module.exports = {
  getAuthenticatedUserFromContext,
  isJwtError,
};
