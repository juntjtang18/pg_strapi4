'use strict';

module.exports = {
  register(/*{ strapi }*/) {},

  bootstrap({ strapi }) {
    console.log('✅ Strapi bootstrap function has been called.');
    console.log('⏳ Scheduling the daily topic selection cron job...');
    
    strapi.cron.add({
      // Test schedule: every minute. Change to '0 0 * * *' for production.
      '0 0 * * *': async () => {
        try {
          console.log('🚀 Cron job triggered! Starting hot topic selection...');
          const knex = strapi.db.connection;

          // Get the table name for the 'topic' model
          const topicModel = strapi.getModel('api::topic.topic');
          const tableName = topicModel.collectionName;
          
          // Use a raw query with RANDOM() for PostgreSQL
          const randomTopics = await knex(tableName)
            .orderByRaw('RANDOM()')
            .limit(2);
          
          console.log(`🔍 Found ${randomTopics.length} random topics.`);

          if (randomTopics.length >= 2) {
            const topicIds = randomTopics.map(topic => topic.id);
            console.log(`📌 Selected Topic IDs: ${topicIds.join(', ')}`);

            // Find the 'Hot Topic' single type entry. Create it if it doesn't exist.
            let hotTopicEntry = await strapi.db.query('api::hot-topic.hot-topic').findOne({ where: { id: 1 } });
            
            if (!hotTopicEntry) {
                 console.log("Hot Topic entry doesn't exist, creating one...");
                 await strapi.entityService.create('api::hot-topic.hot-topic', { data: {} });
                 console.log("Hot Topic entry created.");
            }

            // Update the 'Hot Topic' single type with the new relations
            await strapi.entityService.update('api::hot-topic.hot-topic', 1, {
              data: {
                topics: topicIds,
              },
            });

            console.log('✅ Successfully updated hot topics in the database.');
          } else {
            console.warn('⚠️ Cron job warning: Not enough topics in the database to select two.');
          }
        } catch (error) {
          console.error('❌ An error occurred during the cron job:', error);
        }
      },
    });
  },
};