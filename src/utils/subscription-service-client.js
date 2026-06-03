'use strict';

const axios = require('axios');
const { ApplicationError } = require('@strapi/utils').errors;

const SUBSCRIPTION_SERVICE_CONFIG_ERROR =
  'Subscription service is not configured on the server.';

function trimTrailingSlash(value) {
  return value ? value.replace(/\/+$/, '') : value;
}

function getSubscriptionServiceConfig() {
  const baseUrl = trimTrailingSlash(process.env.SUBSCRIPTION_SERVICE_BASE_URL);
  const secret = process.env.SUBSCRIPTION_SERVICE_SECRET;

  if (!baseUrl || !secret) {
    strapi.log.error(
      'SUBSCRIPTION_SERVICE_BASE_URL or SUBSCRIPTION_SERVICE_SECRET environment variables are not set.'
    );
    throw new ApplicationError(SUBSCRIPTION_SERVICE_CONFIG_ERROR);
  }

  return { baseUrl, secret };
}

function buildError(error) {
  if (error.isAxiosError && error.response) {
    const proxyError = new Error(error.message);
    proxyError.isSubscriptionServiceError = true;
    proxyError.status = error.response.status;
    proxyError.body = error.response.data;
    return proxyError;
  }

  return error;
}

function getLocaleQuery(locale) {
  return locale ? { locale } : undefined;
}

async function requestSubscriptionService(options) {
  const { baseUrl, secret } = getSubscriptionServiceConfig();
  const method = options.method || 'GET';
  const url = `${baseUrl}${options.path}`;

  try {
    const response = await axios.request({
      data: options.data,
      headers: {
        'Content-Type': 'application/json',
        'x-subscription-service-secret': secret,
      },
      method,
      params: options.params,
      url,
    });

    return response.data;
  } catch (error) {
    throw buildError(error);
  }
}

function sendSubscriptionServiceError(ctx, error, fallbackMessage) {
  if (error && error.isSubscriptionServiceError) {
    return ctx.send(error.body, error.status);
  }

  strapi.log.error(fallbackMessage, error);
  return ctx.internalServerError(fallbackMessage);
}

module.exports = {
  getLocaleQuery,
  requestSubscriptionService,
  sendSubscriptionServiceError,
};
