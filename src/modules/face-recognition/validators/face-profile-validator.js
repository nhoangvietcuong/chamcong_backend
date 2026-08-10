const { BadRequestError } = require('../../../errors/app-error');
const ERROR_CODE = require('../../../constants/error-code.constants');

const registerFaceValidator = (req, res, next) => {
  // 1. Check if file exists
  if (!req.file) {
    return next(new BadRequestError('Thiếu ảnh đăng ký khuôn mặt', ERROR_CODE.PHOTO_REQUIRED));
  }

  // 2. Validate MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return next(new BadRequestError('Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP', ERROR_CODE.INVALID_IMAGE_TYPE));
  }

  next();
};

const updateFaceValidator = (req, res, next) => {
  // 1. Check if file exists
  if (!req.file) {
    return next(new BadRequestError('Thiếu ảnh cập nhật khuôn mặt', ERROR_CODE.PHOTO_REQUIRED));
  }

  // 2. Validate MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return next(new BadRequestError('Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP', ERROR_CODE.INVALID_IMAGE_TYPE));
  }

  next();
};

const verifyFaceValidator = (req, res, next) => {
  // 1. Check if file exists
  if (!req.file) {
    return next(new BadRequestError('Thiếu ảnh xác thực khuôn mặt', ERROR_CODE.PHOTO_REQUIRED));
  }

  // 2. Validate MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return next(new BadRequestError('Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP', ERROR_CODE.INVALID_IMAGE_TYPE));
  }

  next();
};

module.exports = {
  registerFaceValidator,
  updateFaceValidator,
  verifyFaceValidator
};
