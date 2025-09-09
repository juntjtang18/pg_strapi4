'use strict';

/**
 * moderation-block service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::moderation-block.moderation-block');
