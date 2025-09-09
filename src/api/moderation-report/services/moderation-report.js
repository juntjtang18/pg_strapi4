'use strict';

/**
 * moderation-report service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::moderation-report.moderation-report');
