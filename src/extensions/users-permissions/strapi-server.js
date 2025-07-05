"use strict";

const axios = require("axios");
const { ApplicationError } = require('@strapi/utils').errors;
const { sanitize } = require('@strapi/utils'); // Import the sanitize utility

module.exports = (plugin) => {
  // =================================================================
  // 1. YOUR ORIGINAL 'ME' ENDPOINT - UNCHANGED
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
  // 2. CUSTOMIZATION FOR THE 'REGISTER' ENDPOINT
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
        console.error("[ERROR] Subscription call failed. Rolling back user creation.", subError.message);
        await userService.remove({ id: newUser.id });
        throw new ApplicationError("Account could not be created due to a subscription system error.");
      }
      
      // *** THIS IS THE CORRECTED LINE ***
      const userSchema = strapi.getModel('plugin::users-permissions.user');
      const sanitizedUser = await sanitize.contentAPI.output(newUser, userSchema);

      return ctx.send({
        jwt: jwtService.issue({ id: sanitizedUser.id }),
        user: sanitizedUser,
      });

    } catch (error) {
      console.error("[ERROR] An error during registration:", error);
      throw error;
    }
  };

  return plugin;
};