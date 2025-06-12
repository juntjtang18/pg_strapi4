'use strict';

/**
 * daily-tip service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::daily-tip.daily-tip');
