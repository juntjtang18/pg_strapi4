"use strict";
console.log("[DEBUG] ==> Loading custom users-permissions strapi-server.js");

const axios = require("axios");
const { ApplicationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils');

module.exports = (plugin) => {
  // =================================================================
  // 1. YOUR ORIGINAL 'ME' ENDPOINT - UNCHANGED
  // =================================================================
  plugin.controllers.user.me = async (ctx) => {
    // ... your 'me' controller code remains the same ...
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
    };
  };


  // =================================================================
  // 2. CUSTOMIZATION FOR THE 'REGISTER' ENDPOINT (WITH FIX)
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
    
    // --- FIX START ---
    // 1. Find the default role for new users
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: settings.default_role } });

    if (!role) {
      throw new ApplicationError('Impossible to find the default role.');
    }
    // --- FIX END ---

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
        role: role.id, // --- FIX: Assign the role ID here
      });

      console.log(`[DEBUG] User ${newUser.email} (ID: ${newUser.id}) created in main Strapi.`);

      // --- Subscription Logic ---
      try {
        console.log("[DEBUG] Entering subscription logic block.");
        const subscriptionUrl = process.env.SUBSYS_BASE_URL;
        const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;
        //console.log(`[DEBUG] Subscription URL: ${subscriptionUrl}, Secret: ${secret}`);
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
      // Inside your register function's subscription logic...
      } catch (subError) {
        // CHANGE THIS:
        // console.error("[ERROR] Subscription call failed. Rolling back user creation.", subError.message);

        // TO THIS:
        console.error("[ERROR] Subscription call failed. Rolling back user creation.", subError);

        await userService.remove({ id: newUser.id });
        throw new ApplicationError("Account could not be created due to a subscription system error.");
      }      
      // --- FIX START ---
      // 2. Re-fetch the user with the role populated for the response
      const userWithRole = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newUser.id,
        { populate: { role: true } }
      );

      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(userWithRole, userSchema);
      // --- FIX END ---

      return ctx.send({
        jwt: jwtService.issue({ id: sanitizedUser.id }),
        user: sanitizedUser,
      });

    } catch (error) {
      console.error("[ERROR] An error during registration:", error);
      // Ensure we don't leak internal errors to the client
      if (error instanceof ApplicationError) {
          throw error;
      }
      // Throw a generic error for other cases
      throw new ApplicationError("An error occurred during the registration process.");
    }
  };

  return plugin;
};