// src/extensions/upload/strapi-server.js
'use strict';

const sharp = require('sharp');

const isImage = (file) => file.mime.startsWith('image/');

module.exports = (plugin) => {
  const originalUpload = plugin.services.upload.upload;

  plugin.services.upload.upload = async function (params) {
    // Get the uploaded file object. This handles both single and multiple uploads.
    const file = Array.isArray(params.files) ? params.files[0] : params.files;

    // If it's not an image, just use the original Strapi function and exit.
    if (!isImage(file)) {
      return await originalUpload.call(this, params);
    }

    console.log('Image file detected. Starting custom processing...');

    try {
      // 1. Process the image using its temporary path to keep memory usage low.
      const processedBuffer = await sharp(file.path).rotate().toBuffer();

      // 2. Create a fresh, clean payload for the upload service.
      const uploadPayload = {
        data: params.data, // Pass along any metadata from the original request
        files: {
          name: file.name,
          type: file.type,
          size: processedBuffer.length,
          buffer: processedBuffer, // Pass the processed buffer directly
        },
      };

      // 3. Call the upload service programmatically with the clean payload.
      // This is the stable, documented way to upload files from within Strapi.
      console.log('Uploading processed image via Strapi upload service...');
      return await strapi.plugin('upload').service('upload').upload(uploadPayload);

    } catch (error) {
      console.error('Error during custom image processing:', error);
      // If an error occurs, we can fall back to the original function
      // or throw an error. For now, we fall back.
      return await originalUpload.call(this, params);
    }
  };

  return plugin;
};