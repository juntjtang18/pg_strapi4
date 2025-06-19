// config/middlewares.js
module.exports = [
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'https://strapi.geniusparentingai.ca',
        'http://localhost:8080',
        'http://localhost:8081',
        'https://www.geniusparentingai.ca',
        'https://my-strapi-app-852311377699.us-west1.run.app',
        'https://chatbot.geniusparentingai.ca',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: '*',
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
      formLimit: '1024mb', // Increase the form limit
      jsonLimit: '1024mb', // Increase the JSON limit
      textLimit: '1024mb', // Increase the text limit
      multipart: {
        maxFileSize: 1024 * 1024 * 1024, // 1 GB
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];