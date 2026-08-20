'use strict';

/**
 * pillar service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::pillar.pillar');
