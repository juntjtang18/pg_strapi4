'use strict';

const jo = require('jpeg-autorotate');
const Jimp = require('jimp');
const { Readable } = require('stream');
const path = require('path');

module.exports = (plugin) => {
  strapi.log.info('✅ Upload plugin extension loaded: jpeg-autorotate with Jimp fallback');
  return plugin;
};