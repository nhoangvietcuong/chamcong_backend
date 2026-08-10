const fs = require('fs');
const sharp = require('sharp');
const attendancePhotoRepository = require('../repositories/attendance-photo-repository');
const { ForbiddenError, NotFoundError } = require('../errors/app-error');
const ROLE = require('../constants/role.constants');

class AttendancePhotoService {
  /**
   * Trích xuất thông số và lưu metadata ảnh vào CSDL
   */
  async savePhoto(photoData, file, client) {
    let imageWidth = null;
    let imageHeight = null;
    let fileSize = null;
    let mimeType = null;

    if (file) {
      fileSize = file.size || null;
      mimeType = file.mimetype || null;

      // Trích xuất độ phân giải ảnh sử dụng Sharp
      if (file.path && fs.existsSync(file.path)) {
        try {
          const metadata = await sharp(file.path).metadata();
          imageWidth = metadata.width || null;
          imageHeight = metadata.height || null;
        } catch (err) {
          console.warn('Failed to extract image dimensions using sharp:', err.message);
        }
      }
    }

    const payload = {
      attendanceId: photoData.attendanceId,
      employeeId: photoData.employeeId,
      assignmentId: photoData.assignmentId,
      photoType: photoData.photoType,
      photoUrl: photoData.photoUrl,
      publicId: photoData.publicId || file?.filename || null,
      capturedAt: photoData.capturedAt || new Date(),
      cloudProvider: photoData.cloudProvider || 'LOCAL',
      fileSize,
      mimeType,
      imageWidth,
      imageHeight,
      faceConfidence: photoData.faceConfidence,
      livenessScore: photoData.livenessScore,
      verificationResult: photoData.verificationResult,
      gpsAccuracy: photoData.gpsAccuracy,
      gpsDistance: photoData.gpsDistance
    };

    return attendancePhotoRepository.create(payload, client);
  }

  /**
   * Lấy toàn bộ ảnh của lần chấm công (Chỉ dành cho Admin/Manager)
   */
  async getPhotosByAttendanceId(attendanceId, user) {
    if (user.role !== ROLE.ADMIN && user.role !== ROLE.MANAGER) {
      throw new ForbiddenError('Bạn không có quyền truy cập dữ liệu ảnh chấm công này');
    }

    const rows = await attendancePhotoRepository.findByAttendanceId(attendanceId);
    return rows.map(row => ({
      photoId: parseInt(row.photo_id, 10),
      attendanceId: row.attendance_id ? parseInt(row.attendance_id, 10) : null,
      employeeId: parseInt(row.employee_id, 10),
      assignmentId: row.assignment_id ? parseInt(row.assignment_id, 10) : null,
      photoType: row.photo_type,
      photoUrl: row.photo_url,
      publicId: row.public_id,
      capturedAt: row.captured_at,
      uploadedAt: row.uploaded_at,
      cloudProvider: row.cloud_provider,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      imageWidth: row.image_width,
      imageHeight: row.image_height,
      faceConfidence: row.face_confidence !== null ? parseFloat(row.face_confidence) : null,
      livenessScore: row.liveness_score !== null ? parseFloat(row.liveness_score) : null,
      verificationResult: row.verification_result,
      gpsAccuracy: row.gps_accuracy !== null ? parseFloat(row.gps_accuracy) : null,
      gpsDistance: row.gps_distance !== null ? parseFloat(row.gps_distance) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Lấy lịch sử ảnh của nhân viên có phân trang & filter (Chỉ dành cho Admin/Manager)
   */
  async getPhotosByEmployee(employeeId, queryParams, user) {
    if (user.role !== ROLE.ADMIN && user.role !== ROLE.MANAGER) {
      throw new ForbiddenError('Bạn không có quyền truy cập lịch sử ảnh của nhân viên này');
    }

    return attendancePhotoRepository.findByEmployee(employeeId, queryParams);
  }

  /**
   * Xóa mềm ảnh chấm công (Chỉ dành cho Admin/Manager)
   */
  async softDeletePhoto(photoId, user) {
    if (user.role !== ROLE.ADMIN && user.role !== ROLE.MANAGER) {
      throw new ForbiddenError('Bạn không có quyền thực hiện hành động này');
    }

    const deleted = await attendancePhotoRepository.softDelete(photoId);
    if (!deleted) {
      throw new NotFoundError('Không tìm thấy ảnh chấm công yêu cầu');
    }
    return deleted;
  }
}

module.exports = new AttendancePhotoService();
