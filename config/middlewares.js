module.exports = [
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      json: {
        limit: '100mb', // Allows JSON payloads up to 100MB
      },
      multipart: {
        maxFileSize: 50 * 1024 * 1024, // 50MB for file uploads
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];