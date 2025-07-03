'use strict';

const { runHotTopicJob, runDailyTipJob } = require('../../../utils/cron-jobs');

module.exports = {
  async runHotTopic(ctx) {
    await runHotTopicJob(strapi);
    ctx.send({ message: '✅ Hot topic job executed' });
  },

  async runDailyTip(ctx) {
    await runDailyTipJob(strapi);
    ctx.send({ message: '✅ Daily tip job executed' });
  },
};
