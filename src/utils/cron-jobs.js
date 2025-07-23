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
  
  async keepSubsysWarm(strapi) {
    try {
      strapi.log.info('🐧 Pinging subsystem to keep it warm...');
      const subscriptionUrl = process.env.SUBSYS_BASE_URL;

      if (!subscriptionUrl) {
        strapi.log.error("SUBSYS_BASE_URL environment variable is not set. Cannot ping subsystem.");
        return;
      }
      
      // Moved this log to be before the request
      strapi.log.info(`Pinging subsystem at ${subscriptionUrl}/api/pings`);

      const response = await axios.get(`${subscriptionUrl}/api/pings`);

      if (response.status === 200) {
        strapi.log.info('✅ Subsystem pinged successfully.');
      } else {
        strapi.log.warn(`⚠️ Subsystem ping returned status: ${response.status}`);
      }
    } catch (error) {
      // Log the full error for better debugging
      strapi.log.error('❌ Error pinging subsystem:', error);
    }
  }
};