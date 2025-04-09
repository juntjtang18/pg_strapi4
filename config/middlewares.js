module.exports = [
  {
    name: 'strapi::cors',
    config: {
      origin: ['http://localhost:8081', 'http://localhost:8080'], // Your Spring Boot app’s origin
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      headers: ['Content-Type', 'Authorization']
    }
  },
  'strapi::errors',
  'strapi::security',
  'strapi::poweredBy',
  {
    name: 'strapi::logger',
    config: {
      level: 'debug', // Increase from default 'info'
    }
  },
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
