// src/extensions/users-permissions/strapi-server.js

"use strict";

module.exports = (plugin) => {
  // Override the default 'me' controller
  plugin.controllers.user.me = async (ctx) => {
    // Ensure the user is authenticated
    if (!ctx.state.user || !ctx.state.user.id) {
      return ctx.response.status = 401; // Unauthorized
    }

    // --- FINAL FIX ---
    // Replace the shallow populate:'*' with a specific, deep-populate object
    const populate = {
      user_profile: {
        populate: {
          children: true,
        },
      },
    };

    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      { populate: populate } // Pass the specific populate object
    );
    // --- END FIX ---

    // Manually build the response object to prevent sanitization from stripping relations
    if (user) {
      ctx.body = {
        id: user.id,
        username: user.username,
        email: user.email,
        confirmed: user.confirmed,
        blocked: user.blocked,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        user_profile: user.user_profile || null,
      };
    } else {
      return ctx.notFound();
    }
  };

  return plugin;
};

