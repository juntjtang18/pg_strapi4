module.exports = () => ({
   'upload': {     
         config: {       
            provider: '@strapi-community/strapi-provider-upload-google-cloud-storage',
            providerOptions: {         
                bucketName: 'lucid-arch-451211-b0-strapi-storage',         
                publicFiles: true,         
                uniform: false,         
                basePath: '',
            }, 
          }, 
     }, 
});
