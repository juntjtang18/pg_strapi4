"use strict";

const logger = require('../../utils/logger'); // Path to src/utils/logger
logger.debug("[DEBUG] ==> Loading custom users-permissions strapi-server.js");

const { ApplicationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils');

module.exports = (plugin) => {
  // =================================================================
  // 1. 'ME' ENDPOINT - WITH USER PROFILE
  // =================================================================
  plugin.controllers.user.me = async (ctx) => {
    if (!ctx.state.user || !ctx.state.user.id) {
      ctx.response.status = 401;
      return;
    }

    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      { populate: { role: true, user_profile: true } }
    );

    if (!user) {
      return ctx.notFound();
    }

    const userSchema = strapi.getModel('plugin::users-permissions.user');
    const sanitizedUser = await sanitize.contentAPI.output(user, userSchema);
    
    // Replace the original user object in the response with our new, detailed one
    ctx.body = sanitizedUser;
  };

// =================================================================
  // 2. 'LOGIN' ENDPOINT (/api/auth/local) - WITH ROLE AND PROFILE
  // =================================================================
  const originalCallback = plugin.controllers.auth.callback;
  plugin.controllers.auth.callback = async (ctx) => {
    // Let the original controller handle the authentication
    await originalCallback(ctx);

    // If authentication was successful, ctx.body will have jwt and user
    if (ctx.body.jwt && ctx.body.user) {
      const user = ctx.body.user;
      
      // Re-fetch the user to populate the role, profile, and its related data
      let userWithDetails = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        user.id,
        { 
          populate: {
            role: true,
            user_profile: {
              populate: ['personality_result', 'children']
            }
          }
        }
      );

      // Check if user-profile exists, create one if it doesn't
      if (!userWithDetails.user_profile) {
        try {
          logger.debug(`[DEBUG] No user-profile found for user ${user.id}. Creating new user-profile.`);
          await strapi.entityService.create('api::user-profile.user-profile', {
            data: {
              users_permissions_user: user.id,
              consentForEmailNotice: false, // Default value from schema
            },
          });
          logger.debug(`[DEBUG] UserProfile created for user ${user.id}.`);

          // Re-fetch user to include the newly created user-profile and other details
          userWithDetails = await strapi.entityService.findOne(
            "plugin::users-permissions.user",
            user.id,
            { 
              populate: { 
                role: true, 
                user_profile: { 
                  populate: ['personality_result', 'children'] 
                } 
              } 
            }
          );
        } catch (profileError) {
          logger.error(`[ERROR] Failed to create user profile for user ${user.id}.`, profileError);
          throw new ApplicationError('Login failed due to a profile system error.');
        }
      }
      
      // Sanitize the user with the role and profile.
      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithDetails, userSchema);
      
      // Replace the original user object in the response with our new, detailed one
      ctx.body.user = sanitizedUser;
    }
  };

// =================================================================
  // 3. 'REGISTER' ENDPOINT - WITH ROLE AND PROFILE
  // =================================================================
  plugin.controllers.auth.register = async (ctx) => {
    logger.debug("[DEBUG] ==> Starting custom /register controller.");

    const userService = strapi.plugin("users-permissions").service("user");
    const jwtService = strapi.plugin("users-permissions").service("jwt");

    const pluginStore = await strapi.store({ type: "plugin", name: "users-permissions" });
    const settings = await pluginStore.get({ key: "advanced" });

    if (!settings.allow_register) {
      throw new ApplicationError("Register action is currently disabled");
    }

    const { email, username, password } = ctx.request.body;
    if (!username || !email || !password ) {
        throw new ApplicationError("Username, email, and password are required.");
    }
    
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: settings.default_role } });

    if (!role) {
      throw new ApplicationError('Impossible to find the default role.');
    }

    const userWithSameEmail = await strapi
      .query("plugin::users-permissions.user")
      .findOne({ where: { email: email.toLowerCase() } });

    if (userWithSameEmail) {
      throw new ApplicationError("Email is already taken");
    }

    let newUser;
    try {
      // Step 1: Create the user.
      newUser = await userService.add({
        username,
        email: email.toLowerCase(),
        password,
        provider: "local",
        confirmed: true,
        role: role.id,
      });
      logger.debug(`[DEBUG] User ${newUser.email} (ID: ${newUser.id}) created successfully.`);

      // Step 2: Create the user-profile immediately after.
      try {
        await strapi.entityService.create('api::user-profile.user-profile', {
            data: {
              users_permissions_user: newUser.id,
            },
        });
        logger.debug(`[DEBUG] UserProfile created for user ${newUser.id}.`);
      } catch (profileError) {
        logger.error(`[ERROR] Failed to create user profile for user ${newUser.id}. Rolling back.`, profileError);
        await userService.remove({ id: newUser.id }); // Clean up the created user
        throw new ApplicationError('Account could not be created due to a profile system error.');
      }
      
      const userWithDetails = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newUser.id,
        { 
          populate: { 
            role: true, 
            user_profile: { 
              populate: ['personality_result', 'children'] 
            }
          }
        }
      );

      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithDetails, userSchema);

      return ctx.send({
        jwt: jwtService.issue({ id: sanitizedUser.id }),
        user: sanitizedUser,
      });

    } catch (error) {
      if (error instanceof ApplicationError) {
          throw error;
      }
      // Generic error for any other unexpected issues
      logger.error("[ERROR] An unexpected error occurred during registration:", error);
      throw new ApplicationError("An error occurred during the registration process.");
    }
  };
  return plugin;
};
