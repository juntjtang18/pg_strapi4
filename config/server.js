// config/server.js
module.exports = ({ env }) => {
  const isLocal = env('IS_LOCAL', 'false') === 'true';

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
    http: {
      enableHttpsRedirect: !isLocal,
      serverOptions: {
        maxHttpBufferSize: 1024 * 1024 * 1024, // 1GB
        requestTimeout: 300000, // 5 minutes
        keepAliveTimeout: 300000, // 5 minutes
      },
    },
  };
};