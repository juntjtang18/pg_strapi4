module.exports = [
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'https://strapi.geniusparentingai.ca', 
        'http://localhost:8080',               
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      headers: ['Content-Type', 'Authorization'],
      credentials: true,
    },
  },
  'strapi::errors',
  'strapi::security',
  'strapi::poweredBy',
  {
    name: 'strapi::logger',
    config: {
      level: 'debug',
    },
  },
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      json: {
        limit: '100mb',
      },
      multipart: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

