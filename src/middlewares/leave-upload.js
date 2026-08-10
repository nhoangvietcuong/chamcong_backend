const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { generateSafeFileName } = require('../utils/file-name');
const { BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

const uploadDir = 'uploads/leave';
const maxFileSizeMb = 10;

// Ensure the upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, generateSafeFileName(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/webp'
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new BadRequestError('Chỉ chấp nhận ảnh định dạng JPEG, PNG, WEBP', ERROR_CODE.INVALID_IMAGE_TYPE), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
}).single('evidencePhoto');

const leaveUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError(`Dung lượng ảnh vượt quá giới hạn tối đa ${maxFileSizeMb}MB`, ERROR_CODE.IMAGE_TOO_LARGE));
        }
        return next(new BadRequestError(err.message, ERROR_CODE.VALIDATION_ERROR));
      }
      return next(err);
    }
    next();
  });
};

module.exports = leaveUpload;
