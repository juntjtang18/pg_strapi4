"use strict";
console.log("[DEBUG] ==> Loading custom users-permissions strapi-server.js");

const axios = require("axios");
const { ApplicationError, ValidationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils');

/**
 * Helper function to transform the raw subscription object from the subsys API
 * into a cleaner, flatter structure for the client.
 * @param {object} rawSubscription - The raw subscription object from the subsys API.
 * @returns {object|null} A clean subscription object or null.
 */
const transformSubscription = (rawSubscription) => {
  if (!rawSubscription?.data?.attributes) {
    return null;
  }

  const subAttrs = rawSubscription.data.attributes;
  const planAttrs = subAttrs.plan?.data?.attributes;

  if (!planAttrs) {
    return {
      id: rawSubscription.data.id,
      status: subAttrs.status,
      startDate: subAttrs.startDate,
      expireDate: subAttrs.expireDate,
      plan: null, // Plan data is missing or malformed
    };
  }
  
  // The 'plan.attributes.attributes' is an extra layer of nesting to remove.
  const planDetails = planAttrs.attributes || {};

  return {
    id: rawSubscription.data.id,
    status: subAttrs.status,
    startDate: subAttrs.startDate,
    expireDate: subAttrs.expireDate,
    plan: {
      id: subAttrs.plan.data.id,
      name: planDetails.name,
      productId: planDetails.productId,
      features: (planDetails.features?.data || []).map(feat => feat.attributes),
      entitlements: planDetails.entitlements || [],
    },
  };
};


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
        // Transform the raw response here
        subscription = transformSubscription(response.data);
        console.log(`[DEBUG] Subscription data fetched and transformed for user ${userId}.`);
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
      subscription: subscription, // Attach CLEAN subscription data here
    };
  };

  // =================================================================
  // 2. 'LOGIN' ENDPOINT (/api/auth/local) - WITH SUBSCRIPTION
  // =================================================================
  const originalCallback = plugin.controllers.auth.callback;
  plugin.controllers.auth.callback = async (ctx) => {
    // Let the original controller handle the authentication
    await originalCallback(ctx);

    // If authentication was successful, ctx.body will have jwt and user
    if (ctx.body.jwt && ctx.body.user) {
      const user = ctx.body.user;
      let subscription = null;
      try {
        console.log(`[DEBUG] Login successful for user ${user.id}. Fetching subscription.`);
        const subscriptionUrl = process.env.SUBSYS_BASE_URL;
        const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

        if (!subscriptionUrl || !secret) {
          console.error("[ERROR] Subscription environment variables not set. Skipping call.");
        } else {
          const response = await axios.get(
            `${subscriptionUrl}/api/v1/subscription-of-a-user/${user.id}`,
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          // Transform the raw response here
          subscription = transformSubscription(response.data);
          console.log(`[DEBUG] Subscription data fetched and transformed for user ${user.id}.`);
        }
      } catch (error) {
        console.error(`[ERROR] Failed to fetch subscription data for user ${user.id} during login.`, error.message);
        subscription = null;
      }
      // Attach the CLEAN subscription to the user object in the response
      ctx.body.user.subscription = subscription;
    }
  };


  // =================================================================
  // 3. 'REGISTER' ENDPOINT - WITH FIX
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
      const newUser = await userService.add({
        username,
        email: email.toLowerCase(),
        password,
        provider: "local",
        confirmed: true,
        role: role.id,
      });

      console.log(`[DEBUG] User ${newUser.email} (ID: ${newUser.id}) created in main Strapi.`);

      // --- Subscription Logic ---
      try {
        console.log("[DEBUG] Entering subscription logic block.");
        const subscriptionUrl = process.env.SUBSYS_BASE_URL;
        const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
        if (!subscriptionUrl || !secret) {
          console.error("[ERROR] Subscription environment variables not set. Skipping call.");
        } else {
          console.log(`[DEBUG] Calling subscription endpoint: ${subscriptionUrl}`);
          await axios.post(
            `${subscriptionUrl}/api/subscriptions/subscribe-free-plan`,
            { userId: newUser.id }, 
            { headers: { Authorization: `Bearer ${secret}` } }
          );
          console.log(`[DEBUG] Subscription call completed for user ${newUser.id}.`);
        }
      } catch (subError) {
        console.error("[ERROR] Subscription call failed. Rolling back user creation.", subError);

        await userService.remove({ id: newUser.id });
        throw new ApplicationError("Account could not be created due to a subscription system error.");
      }      
      
      const userWithRole = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newUser.id,
        { populate: { role: true } }
      );

      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithRole, userSchema);

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