'use strict';

module.exports = {
  async activate(ctx) {
    let user; // Define user in the broader scope

    try {
      // =================================================================
      // MANUAL AUTHENTICATION - Following the pattern from your user-profile controller
      // =================================================================
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];

      // Verify the token to get the user ID
      const { id: userId } = await strapi.plugin('users-permissions').service('jwt').verify(token);
      if (!userId) {
        return ctx.unauthorized('Invalid token: User ID not found.');
      }
      
      // Fetch the user to ensure they exist (optional but good practice)
      user = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
      if (!user) {
        return ctx.unauthorized('User not found for this token.');
      }
      // =================================================================
      // END MANUAL AUTHENTICATION
      // =================================================================

      const { apple_receipt } = ctx.request.body;

      if (!apple_receipt) {
        return ctx.badRequest('The "apple_receipt" is required.');
      }

      // We can now safely use user.id
      const resultFromSubsystem = await strapi
        .service('api::subscription.subscription')
        .forwardActivationToSubsystem({
          userId: user.id,
          receipt: apple_receipt,
        });

      // Return the response from the subsystem directly to the client
      return ctx.send(resultFromSubsystem);

    } catch (error) {
      // Handle JWT errors specifically, like in your example
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      
      const userIdLog = user ? `for user ${user.id}` : '';
      strapi.log.error(`Subsystem Activation Error ${userIdLog}: ${error.message}`);
      
      if (error.isAxiosError && error.response) {
        return ctx.send(error.response.data, error.response.status);
      }
      
      return ctx.internalServerError('An unexpected error occurred.');
    }
  },
};