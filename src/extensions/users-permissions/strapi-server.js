"use strict";

module.exports = (plugin) => {
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

  return plugin;
};
