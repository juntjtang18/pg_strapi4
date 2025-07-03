'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/cron-test/hot-topic',
      handler: 'cron-test.runHotTopic',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/cron-test/daily-tip',
      handler: 'cron-test.runDailyTip',
      config: {
        auth: false,
      },
    }
  ]
};
