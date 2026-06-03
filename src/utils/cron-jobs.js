'use strict';

// Add the axios import at the top
const axios = require('axios');

module.exports = {
  // ... (your other cron jobs runHotTopicJob, runDailyTipJob are fine) ...
  async runHotTopicJob(strapi) {
    try {
      console.log('🚀 Manually triggering hot topic job...');
      const knex = strapi.db.connection;
      const topicModel = strapi.getModel('api::topic.topic');
      const tableName = topicModel.collectionName;

      const randomTopics = await knex(tableName).orderByRaw('RANDOM()').limit(3);
      if (randomTopics.length >= 3) {
        const topicIds = randomTopics.map(topic => topic.id);
        console.log(`📌 Selected Topic IDs: ${topicIds.join(', ')}`);

        let hotTopicEntry = await strapi.db.query('api::hot-topic.hot-topic').findOne({ where: { id: 1 } });
        if (!hotTopicEntry) {
          await strapi.entityService.create('api::hot-topic.hot-topic', { data: {} });
        }

        await strapi.entityService.update('api::hot-topic.hot-topic', 1, { data: { topics: topicIds } });
        console.log('✅ Successfully updated hot topics in the database.');
      } else {
        console.warn('⚠️ Not enough topics to select from.');
      }
    } catch (error) {
      console.error('❌ Error in hot topic job:', error);
    }
  },

  async runDailyTipJob(strapi) {
    try {
      console.log('🚀 Manually triggering daily tip job...');
      const knex = strapi.db.connection;
      const tipModel = strapi.getModel('api::tip.tip');
      const tableName = tipModel.collectionName;

      const randomTips = await knex(tableName).orderByRaw('RANDOM()').limit(3);
      if (randomTips.length >= 3) {
        const tipIds = randomTips.map(tip => tip.id);
        console.log(`📌 Selected Tip IDs: ${tipIds.join(', ')}`);

        let dailyTipEntry = await strapi.db.query('api::daily-tip.daily-tip').findOne({ where: { id: 1 } });
        if (!dailyTipEntry) {
          await strapi.entityService.create('api::daily-tip.daily-tip', { data: {} });
        }

        await strapi.entityService.update('api::daily-tip.daily-tip', 1, { data: { tips: tipIds } });
        console.log('✅ Successfully updated daily tips in the database.');
      } else {
        console.warn('⚠️ Not enough tips to select from.');
      }
    } catch (error) {
      console.error('❌ Error in daily tip job:', error);
    }
  },
  
  async keepSubscriptionServiceWarm(strapi) {
    try {
      strapi.log.info('Pinging subscription service to keep it warm...');
      const subscriptionUrl = process.env.SUBSCRIPTION_SERVICE_BASE_URL;

      if (!subscriptionUrl) {
        strapi.log.error('SUBSCRIPTION_SERVICE_BASE_URL environment variable is not set. Cannot ping subscription service.');
        return;
      }

      strapi.log.info(`Pinging subscription service at ${subscriptionUrl}/healthz`);

      const response = await axios.get(`${subscriptionUrl}/healthz`);

      if (response.status === 200) {
        strapi.log.info('Subscription service pinged successfully.');
      } else {
        strapi.log.warn(`Subscription service ping returned status: ${response.status}`);
      }
    } catch (error) {
      strapi.log.error('Error pinging subscription service:', error);
    }
  }
};
