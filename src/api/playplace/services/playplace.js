'use strict';

/**
 * playplace service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::playplace.playplace');
