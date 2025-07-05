'use strict';

/**
 * entitlement service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::entitlement.entitlement');
