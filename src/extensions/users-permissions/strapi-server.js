"use strict";
console.log("[DEBUG] ==> Loading custom users-permissions strapi-server.js");

const axios = require("axios");
const { ApplicationError, ValidationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils');

module.exports = (plugin) => {
  // =================================================================
  // 1. 'ME' ENDPOINT - WITH SUBSCRIPTION
  // =================================================================
  plugin.controllers.user.me = async (ctx) => {
    if (!ctx.state.user || !ctx.state.user.id) {
      ctx.response.status = 401;
      return;
    }

    const populate = {
      role: true,
      user_profile: {
        populate: {
          children: true,
        },
      },
    };

    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      { populate }
    );

    if (!user) {
      return ctx.notFound();
    }

    // --- Subscription Fetching Logic ---
    let subscription = null;
    try {
      console.log("[DEBUG] Entering subscription fetching logic for 'me' endpoint.");
      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
      
      if (!subscriptionUrl || !secret) {
        console.error("[ERROR] Subscription environment variables not set. Skipping call.");
      } else {
        const userId = ctx.state.user.id;
        console.log(`[DEBUG] Calling subscription endpoint for user ${userId}`);
        const response = await axios.get(
          `${subscriptionUrl}/api/v1/subscription-of-a-user/${userId}`,
          { headers: { Authorization: `Bearer ${secret}` } }
        );
        subscription = response.data;
        console.log(`[DEBUG] Subscription data fetched successfully for user ${userId}.`);
      }
    } catch (error) {
      console.error("[ERROR] Failed to fetch subscription data for user.", error.message);
      subscription = null;
    }
    // --- End Subscription Logic ---

    const cleanRole = user.role
      ? (({ id, name, description, type }) => ({ id, name, description, type }))(user.role)
      : null;

    const cleanChildren = Array.isArray(user.user_profile?.children)
      ? user.user_profile.children.map(({ id, name, age, gender }) => ({
          id, name, age, gender,
        }))
      : [];

    const cleanUserProfile = user.user_profile
      ? {
          id: user.user_profile.id,
          locale: user.user_profile.locale,
          consentForEmailNotice: user.user_profile.consentForEmailNotice,
          children: cleanChildren,
        }
      : null;

    ctx.body = {
      id: user.id,
      username: user.username,
      email: user.email,
      confirmed: user.confirmed,
      blocked: user.blocked,
      role: cleanRole,
      user_profile: cleanUserProfile,
      subscription: subscription,
    };
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
      
      // Re-fetch the user to populate the role
      const userWithRole = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        user.id,
        { populate: { role: true } }
      );

      const subscriptionUrl = process.env.SUBSYS_BASE_URL;
      const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

      if (!subscriptionUrl || !secret) {
        console.error("[ERROR] Subscription environment variables not set for login. Skipping call.");
      } else {
        try {
          // First, try to fetch the existing subscription
          console.log(`[DEBUG] Login successful for user ${user.id}. Fetching subscription.`);
          const response = await axios.get(
            `${subscriptionUrl}/api/v1/subscription-of-a-user/${user.id}`,
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          subscription = response.data;
          console.log(`[DEBUG] Subscription data fetched for user ${user.id}.`);
        } catch (error) {
          console.warn(`[WARN] Could not fetch subscription for user ${user.id}. Attempting creation...`, error.message);

          try {
            // Create the free plan. The response from this endpoint is already complete.
            const creationResponse = await axios.post(
              `${subscriptionUrl}/api/v1/subscriptions/subscribe-free-plan`,
              { userId: user.id }, 
              { headers: { Authorization: `Bearer ${secret}` } }
            );
            subscription = creationResponse.data;
            console.log(`[DEBUG] Successfully created new subscription for user ${user.id}.`);

          } catch (creationError) {
            console.error(`[ERROR] CRITICAL: A failure occurred during the subscription creation process for user ${user.id}.`, creationError.message);
          }
        }
      }
      
      // Sanitize the user with the role, then attach the subscription
      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithRole, userSchema);
      sanitizedUser.subscription = subscription;

      // Replace the original user object in the response with our new, detailed one
      ctx.body.user = sanitizedUser;
    }
  };


  // =================================================================
  // 3. 'REGISTER' ENDPOINT - WITH SUBSCRIPTION & ROLE
  // =================================================================
  plugin.controllers.auth.register = async (ctx) => {
    console.log("[DEBUG] ==> Starting custom /register controller.");

    const userService = strapi.plugin("users-permissions").service("user");
    const jwtService = strapi.plugin("users-permissions").service("jwt");

    const pluginStore = await strapi.store({ type: "plugin", name: "users-permissions" });
    const settings = await pluginStore.get({ key: "advanced" });

    if (!settings.allow_register) {
      throw new ApplicationError("Register action is currently disabled");
    }

    const { email, username, password } = ctx.request.body;
    if (!username || !email || !password) {
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

    try {
      // Create the user in GPA
      const newUser = await userService.add({
        username,
        email: email.toLowerCase(),
        password,
        provider: "local",
        confirmed: true,
        role: role.id,
      });
      console.log(`[DEBUG] User ${newUser.email} (ID: ${newUser.id}) created in main Strapi.`);

      let subscription = null;
      try {
        // Create the subscription in SUBSYS
        console.log(`[DEBUG] Calling subscription endpoint to create free plan for user ${newUser.id}.`);
        const subscriptionUrl = process.env.SUBSYS_BASE_URL;
        const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
        
        if (!subscriptionUrl || !secret) {
          console.error("[ERROR] Subscription environment variables not set. Skipping call.");
        } else {
          const creationResponse = await axios.post(
            `${subscriptionUrl}/api/v1/subscriptions/subscribe-free-plan`,
            { userId: newUser.id }, 
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          subscription = creationResponse.data;
          console.log(`[DEBUG] Subscription creation/fetch completed for user ${newUser.id}.`);
        }
      } catch (subError) {
        console.error("[ERROR] Subscription call failed. Rolling back user creation.", subError);
        await userService.remove({ id: newUser.id });
        throw new ApplicationError("Account could not be created due to a subscription system error.");
      }      
      
      // Re-fetch the user to ensure the role is populated for the response.
      const userWithRole = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newUser.id,
        { populate: { role: true } }
      );

      // Sanitize user data and manually add the subscription object to the response
      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithRole, userSchema);
      sanitizedUser.subscription = subscription;

      return ctx.send({
        jwt: jwtService.issue({ id: sanitizedUser.id }),
        user: sanitizedUser,
      });

    } catch (error) {
      console.error("[ERROR] An error during registration:", error);
      if (error instanceof ApplicationError) {
          throw error;
      }
      throw new ApplicationError("An error occurred during the registration process.");
    }
  };

  return plugin;
};