class AppError extends Error {
  constructor(message, statusCode, errorCode = 'INTERNAL_ERROR', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errorCode = errorCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Dữ liệu đầu vào không hợp lệ', errorCode = 'BAD_REQUEST', errors = []) {
    super(message, 400, errorCode, errors);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Chưa xác thực hoặc token không hợp lệ', errorCode = 'UNAUTHORIZED') {
    super(message, 401, errorCode);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Không có quyền truy cập', errorCode = 'FORBIDDEN') {
    super(message, 403, errorCode);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy dữ liệu', errorCode = 'NOT_FOUND') {
    super(message, 404, errorCode);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Xung đột hoặc dữ liệu trùng lặp', errorCode = 'CONFLICT') {
    super(message, 409, errorCode);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Không đáp ứng điều kiện nghiệp vụ', errorCode = 'VALIDATION_FAILED', errors = []) {
    super(message, 422, errorCode, errors);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Dịch vụ tạm thời không khả dụng', errorCode = 'SERVICE_UNAVAILABLE') {
    super(message, 503, errorCode);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
};

