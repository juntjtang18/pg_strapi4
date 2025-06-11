module.exports = ({ env }) => {
  const isLocal = env('IS_LOCAL', 'false') === 'true'; // Check if the environment variable is set to 'true'

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 8080),
    app: {
      keys: env.array('APP_KEYS'),
    },
    cron: {
      enabled: true,
    },
    webhooks: {
      populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
    // Only enable HTTPS redirection in production (not locally)
    http: {
      enableHttpsRedirect: !isLocal,  // Disable HTTPS redirect locally
    },
  };
};
