'use strict';

module.exports = {
  register(/*{ strapi }*/) {},

  bootstrap({ strapi }) {
    console.log('✅ Strapi bootstrap function has been called.');
    console.log('⏳ Scheduling background jobs...');
    
    // --- JOB 1: HOT TOPICS (Unchanged) ---
    strapi.cron.add({
      '0 0 0 * * *': async () => { 
        try {
          console.log('🚀 Cron job triggered! Starting hot topic selection...');
          const knex = strapi.db.connection;
          const topicModel = strapi.getModel('api::topic.topic');
          const tableName = topicModel.collectionName;
          
          const randomTopics = await knex(tableName).orderByRaw('RANDOM()').limit(2);
          
          if (randomTopics.length >= 2) {
            const topicIds = randomTopics.map(topic => topic.id);
            console.log(`📌 Selected Topic IDs: ${topicIds.join(', ')}`);

            let hotTopicEntry = await strapi.db.query('api::hot-topic.hot-topic').findOne({ where: { id: 1 } });
            if (!hotTopicEntry) {
                 await strapi.entityService.create('api::hot-topic.hot-topic', { data: {} });
            }

            await strapi.entityService.update('api::hot-topic.hot-topic', 1, { data: { topics: topicIds } });
            console.log('✅ Successfully updated hot topics in the database.');
          } else {
            console.warn('⚠️ Cron job (Hot Topics): Not enough topics to select from.');
          }
        } catch (error) {
          console.error('❌ An error occurred during the Hot Topics cron job:', error);
        }
      },
    });

    // --- JOB 2: DAILY TIPS (Modified to select 2) ---
    strapi.cron.add({
      '0 0 0 * * *': async () => { 
        try {
          console.log('🚀 Cron job triggered! Starting daily tip selection...');
          const knex = strapi.db.connection;
          const tipModel = strapi.getModel('api::tip.tip');
          const tableName = tipModel.collectionName;

          // --- CHANGE: Fetch 2 random tips instead of 1 ---
          const randomTips = await knex(tableName).orderByRaw('RANDOM()').limit(2);

          // --- CHANGE: Check if we found at least 2 tips ---
          if (randomTips.length >= 2) {
            const tipIds = randomTips.map(tip => tip.id);
            console.log(`📌 Selected Tip IDs: ${tipIds.join(', ')}`);

            let dailyTipEntry = await strapi.db.query('api::daily-tip.daily-tip').findOne({ where: { id: 1 } });
            if (!dailyTipEntry) {
                 await strapi.entityService.create('api::daily-tip.daily-tip', { data: {} });
            }

            // --- CHANGE: Pass the array of two IDs ---
            await strapi.entityService.update('api::daily-tip.daily-tip', 1, { data: { tips: tipIds } });

            console.log('✅ Successfully updated daily tips in the database.');
          } else {
            console.warn('⚠️ Cron job (Daily Tip): Not enough tips found to select two.');
          }
        } catch (error) {
          console.error('❌ An error occurred during the Daily Tip cron job:', error);
        }
      },
    });
  },
};