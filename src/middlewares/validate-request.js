const { validationResult } = require('express-validator');
const { BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Clean up uploaded file if validation failed
    if (req.file && req.file.filename) {
      const fileStorageService = require('../services/file-storage-service');
      fileStorageService.deleteFile(req.file.filename).catch(err =>
        console.error('Failed to delete validation error file:', err)
      );
    }

    const errorDetails = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    console.error('Validation errors:', JSON.stringify(errorDetails, null, 2));
    return next(new BadRequestError('Dữ liệu đầu vào không hợp lệ', ERROR_CODE.VALIDATION_ERROR, errorDetails));
  }
  next();
};

module.exports = validateRequest;
