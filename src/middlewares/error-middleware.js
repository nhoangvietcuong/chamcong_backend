const { AppError } = require('../errors/app-error');
const logger = require('../utils/logger');

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.errorCode = err.errorCode || 'INTERNAL_ERROR';
  err.errors = err.errors || [];

  const response = {
    success: false,
    message: err.message || 'Lỗi hệ thống',
    errorCode: err.errorCode,
    errors: err.errors,
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Log the error for diagnostics
  if (err.statusCode >= 500) {
    logger.error(`ERROR 💥: ${err.message}`, err);
  } else {
    logger.warn(`WARN [${err.statusCode} - ${err.errorCode}]: ${err.message}`);
  }

  res.status(err.statusCode).json(response);
};

module.exports = globalErrorHandler;
