'use strict';

/**
 * hot-topic service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::hot-topic.hot-topic');
