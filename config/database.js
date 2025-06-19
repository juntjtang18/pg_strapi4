module.exports = ({ env }) => {
  const dbConfig = {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '/cloudsql/lucid-arch-451211-b0:us-west1:cloud-sql-server'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi-db3'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'Passw0rd@Strapi'),
      schema: env('DATABASE_SCHEMA', 'public'),
    },
    debug: false,
  };

  // ✅ Log the database connection configuration (except the password for security)
  console.log('Strapi is connecting to the database with config:');
  console.log({
    client: dbConfig.client,
    host: dbConfig.connection.host,
    port: dbConfig.connection.port,
    database: dbConfig.connection.database,
    user: dbConfig.connection.user,
    schema: dbConfig.connection.schema,
  });

  return {
    connection: dbConfig,
  };
};
