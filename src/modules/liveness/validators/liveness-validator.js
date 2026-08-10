const { BadRequestError, NotFoundError } = require('../../../errors/app-error');
const employeeRepository = require('../../../repositories/employee-repository');

class LivenessValidator {
  /**
   * Validate liveness request input, file and employee state.
   */
  async validateRequest(req) {
    const { employeeId } = req.body;
    const file = req.file;

    // 1. Verify employeeId is provided
    if (!employeeId) {
      throw new BadRequestError('Thiếu ID nhân viên', 'EMPLOYEE_ID_REQUIRED');
    }

    const parsedId = parseInt(employeeId, 10);
    if (isNaN(parsedId)) {
      throw new BadRequestError('ID nhân viên không hợp lệ', 'INVALID_EMPLOYEE_ID');
    }

    // 2. Verify employee exists and is active
    const employee = await employeeRepository.findById(parsedId);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', 'EMPLOYEE_NOT_FOUND');
    }
    if (employee.status !== 1) {
      throw new BadRequestError('Nhân viên hiện đang ngừng hoạt động', 'EMPLOYEE_INACTIVE');
    }

    // 3. Verify single file uploaded
    if (!file) {
      throw new BadRequestError('Thiếu file liveness', 'FILE_REQUIRED');
    }

    // 4. Validate MIME Type
    const allowedMimeTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime', // .mov
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestError('Không đúng định dạng file (chỉ chấp nhận video hoặc ảnh)', 'INVALID_FILE_TYPE');
    }

    // 5. Validate file size (e.g. limit to 10MB to accommodate video sizes)
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestError('File quá lớn (tối đa 10MB)', 'FILE_TOO_LARGE');
    }
  }
}

module.exports = new LivenessValidator();
