'use strict';

// Read the log level from the environment variable. Default to 'info'.
const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * A simple logger utility that logs messages based on the SUBSYS_LOG_LEVEL.
 * - 'debug' level logs everything (debug, info, warn, error).
 * - 'info' level logs info, warn, and errors.
 * - Any other level will only log errors.
 */
const logger = {
  /**
   * Logs a message only if the log level is 'debug'.
   * @param {...any} args - The messages or objects to log.
   */
  debug: (...args) => {
    if (logLevel === 'debug') {
      console.log(...args);
    }
  },

  /**
   * Logs an informational message if the level is 'info' or 'debug'.
   * @param {...any} args - The messages or objects to log.
   */
  info: (...args) => {
    if (logLevel === 'debug' || logLevel === 'info') {
      console.log(...args);
    }
  },

  /**
   * Logs a warning message if the level is 'info' or 'debug'.
   * @param {...any} args - The messages or objects to log.
   */
  warn: (...args) => {
    if (logLevel === 'debug' || logLevel === 'info') {
      console.warn(...args);
    }
  },

  /**
   * Always logs an error message, regardless of log level.
   * @param {...any} args - The error messages or objects to log.
   */
  error: (...args) => {
    console.error(...args);
  },
};

module.exports = logger;