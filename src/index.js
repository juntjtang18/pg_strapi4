'use strict';

const { runHotTopicJob, runDailyTipJob, keepSubscriptionServiceWarm } = require('./utils/cron-jobs');

module.exports = {
  register(/*{ strapi }*/) {},

  bootstrap({ strapi }) {
    //console.log('✅ Strapi bootstrap function has been called.');
    //console.log('⏳ Scheduling background jobs...');

    // --- HOT TOPIC DAILY JOB ---
    strapi.cron.add({
      '0 0 * * *': async () => {
        await runHotTopicJob(strapi);
      },
    });

    // --- DAILY TIP JOB ---
    strapi.cron.add({
      '0 0 * * *': async () => {
        await runDailyTipJob(strapi);
      },
    });
    // --- SUBSCRIPTION SERVICE PING CRON JOB ---
    strapi.cron.add({
      '*/8 * * * *': async () => {
        await keepSubscriptionServiceWarm(strapi);
      },
    });

    console.log('📅 Cron jobs registered successfully.');

    const len = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0;
    strapi.log.info(`OPENAI_API_KEY length at bootstrap: ${len}`);
    strapi.log.info(`CWD at bootstrap: ${process.cwd()}`);
  },
};
