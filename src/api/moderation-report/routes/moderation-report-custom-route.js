// src/api/moderation-report/routes/moderation-report-custom-route.js
module.exports = {
  routes: [
    { method: 'POST', path: '/moderation/report/post',    handler: 'moderation-report.reportPost', config: { auth: false } },
    { method: 'POST', path: '/moderation/report/comment', handler: 'moderation-report.reportComment', config: { auth: false } },
    { method: 'POST', path: '/moderation/report/user',    handler: 'moderation-report.reportUser', config: { auth: false } },
    // Admin-only in your app logic (checks done in controller)
    { method: 'POST', path: '/moderation/report/resolve', handler: 'moderation-report.resolve', config: { auth: false } },
  ]
};
