// src/extensions/upload/strapi-server.js
console.log('Upload extension loaded');

module.exports = (plugin) => {
  console.log('Upload extension registered');

  // Log before upload service is called
  const originalUpload = plugin.services.upload.upload;
  plugin.services.upload.upload = async function (params) {
    console.log('Upload service called');
    console.log('Upload params:', params);
    console.log('File size:', params.files.size || params.files[0]?.size);
    console.log('Configured sizeLimit:', strapi.plugins.upload.config.sizeLimit);
    console.log('Formidable maxFileSize:', strapi.plugins.upload.config.formidable?.maxFileSize);

    try {
      return await originalUpload.call(this, params);
    } catch (error) {
      console.error('Upload error:', error.message, error.stack);
      throw error;
    }
  };

  return plugin;
};