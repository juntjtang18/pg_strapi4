module.exports = ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi-db2'),
      user: env('DATABASE_USERNAME', 'dbadmin'),
      password: env('DATABASE_PASSWORD', 'tj13in4link'),
      schema: env('DATABASE_SCHEMA', 'public'),
    },
    debug: false,
  },
});

