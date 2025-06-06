module.exports = ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi-dev3'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'Passw0rd@Strapi'),
      schema: env('DATABASE_SCHEMA', 'public'),
    },
    debug: false,
  },
});

