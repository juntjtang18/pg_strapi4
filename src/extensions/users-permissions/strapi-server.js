"use strict";

const logger = require('../../utils/logger'); // Path to src/utils/logger
logger.debug("[DEBUG] ==> Loading custom users-permissions strapi-server.js");

const axios = require("axios");
const { ApplicationError, ValidationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils');

module.exports = (plugin) => {
  // =================================================================
  // 1. 'ME' ENDPOINT - WITH SUBSCRIPTION & USER PROFILE
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

    // --- Subscription Fetching Logic ---
    let subscription = null;
    try {
      logger.debug("[DEBUG] Entering subscription fetching logic for 'me' endpoint.");
      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
      
      if (!subscriptionUrl || !secret) {
        logger.error("[ERROR] Subscription environment variables not set. Skipping call.");
      } else {
        const userId = ctx.state.user.id;
        logger.debug(`[DEBUG] Calling subscription endpoint for user ${userId}`);
        const response = await axios.get(
          `${subscriptionUrl}/api/v1/subscription-of-a-user/${userId}`,
          { headers: { Authorization: `Bearer ${secret}` } }
        );
        subscription = response.data;
        logger.debug(`[DEBUG] Subscription data fetched successfully for user ${userId}.`);
      }
    } catch (error) {
      logger.error("[ERROR] Failed to fetch subscription data for user.", error.message);
      subscription = null;
    }
    // --- End Subscription Logic ---

    const userSchema = strapi.getModel('plugin::users-permissions.user');
    const sanitizedUser = await sanitize.contentAPI.output(user, userSchema);
    sanitizedUser.subscription = subscription;
    
    // Replace the original user object in the response with our new, detailed one
    ctx.body = sanitizedUser;
  };

  // =================================================================
  // 2. 'LOGIN' ENDPOINT (/api/auth/local) - WITH SUBSCRIPTION & ROLE
  // =================================================================
  const originalCallback = plugin.controllers.auth.callback;
  plugin.controllers.auth.callback = async (ctx) => {
    // Let the original controller handle the authentication
    await originalCallback(ctx);

    // If authentication was successful, ctx.body will have jwt and user
    if (ctx.body.jwt && ctx.body.user) {
      const user = ctx.body.user;
      let subscription = null;
      
      // Re-fetch the user to populate the role and profile
      let userWithDetails = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        user.id,
        { populate: { role: true, user_profile: true } }
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

          // Re-fetch user to include the newly created user-profile
          userWithDetails = await strapi.entityService.findOne(
            "plugin::users-permissions.user",
            user.id,
            { populate: { role: true, user_profile: true } }
          );
        } catch (profileError) {
          logger.error(`[ERROR] Failed to create user profile for user ${user.id}.`, profileError);
          throw new ApplicationError('Login failed due to a profile system error.');
        }
      }

      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

      if (!subscriptionUrl || !secret) {
        logger.error("[ERROR] Subscription environment variables not set for login. Skipping call.");
      } else {
        try {
          // First, try to fetch the existing subscription
          logger.info(`[DEBUG] Login successful for user ${user.id}. Fetching subscription.`);
          const response = await axios.get(
            `${subscriptionUrl}/api/v1/subscription-of-a-user/${user.id}`,
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          subscription = response.data;
          logger.debug(`[DEBUG] Subscription data fetched for user ${user.id}.`);
        } catch (error) {
          logger.warn(`[WARN] Could not fetch subscription for user ${user.id}. Attempting creation...`, error.message);

          try {
            // Create the free plan. The response from this endpoint is already complete.
            const creationResponse = await axios.post(
              `${subscriptionUrl}/api/v1/subscriptions/subscribe-free-plan`,
              { userId: user.id }, 
              { headers: { Authorization: `Bearer ${secret}` } }
            );
            subscription = creationResponse.data;
            logger.debug(`[DEBUG] Successfully created new subscription for user ${user.id}.`);
          } catch (creationError) {
            logger.error(`[ERROR] CRITICAL: A failure occurred during the subscription creation process for user ${user.id}.`, creationError.message);
          }
        }
      }
      
      // Sanitize the user with the role, then attach the subscription and profile
      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithDetails, userSchema);
      sanitizedUser.subscription = subscription;
      
      // Replace the original user object in the response with our new, detailed one
      ctx.body.user = sanitizedUser;
    }
  };

  // =================================================================
  // 3. 'REGISTER' ENDPOINT - WITH SUBSCRIPTION & ROLE
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
      // Step 3: Create the subscription in the subsystem.
      let subscription = null;
      try {
        const subscriptionUrl = process.env.SUBSYS_BASE_URL;
        const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
        
        if (!subscriptionUrl || !secret) {
          logger.error("[ERROR] Subscription environment variables not set. Skipping call.");
        } else {
          const creationResponse = await axios.post(
            `${subscriptionUrl}/api/v1/subscriptions/subscribe-free-plan`,
            { userId: newUser.id }, 
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          subscription = creationResponse.data;
          logger.debug(`[DEBUG] Subscription creation completed for user ${newUser.id}.`);
        }
      } catch (subError) {
        // If subscription fails, roll back the user (which should also cascade delete the profile)
        let subErrorMessage = subError.message;
        if (subError.response && subError.response.data && subError.response.data.error) {
          subErrorMessage = subError.response.data.error.message;
        }
        logger.error(`[ERROR] Subscription call failed. Rolling back user creation. Reason: ${subErrorMessage}`);
        
        await userService.remove({ id: newUser.id });
        throw new ApplicationError("Account could not be created due to a subscription system error.");
      }      
      
      const userWithDetails = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newUser.id,
        { populate: { role: true, user_profile: true } }
      );

      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithDetails, userSchema);
      sanitizedUser.subscription = subscription;

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