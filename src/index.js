'use strict';

const { runHotTopicJob, runDailyTipJob } = require('./utils/cron-jobs');

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

    console.log('📅 Cron jobs registered successfully.');
  },
};
