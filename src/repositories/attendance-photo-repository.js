const { pool } = require('../config/db');

class AttendancePhotoRepository {
  async create(data, client = pool) {
    const query = `
      INSERT INTO public.attendance_photos (
        attendance_id, employee_id, assignment_id, photo_type, photo_url, public_id,
        captured_at, cloud_provider, file_size, mime_type, image_width, image_height,
        face_confidence, liveness_score, verification_result, gps_accuracy, gps_distance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    const values = [
      data.attendanceId || null,
      data.employeeId,
      data.assignmentId || null,
      data.photoType,
      data.photoUrl,
      data.publicId || null,
      data.capturedAt || null,
      data.cloudProvider || 'LOCAL',
      data.fileSize || null,
      data.mimeType || null,
      data.imageWidth || null,
      data.imageHeight || null,
      data.faceConfidence || null,
      data.livenessScore || null,
      data.verificationResult || null,
      data.gpsAccuracy || null,
      data.gpsDistance || null
    ];
    const res = await client.query(query, values);
    return res.rows[0];
  }

  async findByAttendanceId(attendanceId, client = pool) {
    const query = `
      SELECT * FROM public.attendance_photos
      WHERE attendance_id = $1 AND is_deleted = 0
      ORDER BY captured_at ASC, photo_id ASC
    `;
    const res = await client.query(query, [attendanceId]);
    return res.rows;
  }

  async findByEmployee(employeeId, queryParams = {}, client = pool) {
    const { photoType, dateFrom, dateTo } = queryParams;
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const offset = (page - 1) * limit;

    let baseQuery = `
      FROM public.attendance_photos
      WHERE employee_id = $1 AND is_deleted = 0
    `;
    const values = [employeeId];
    let paramIdx = 2;

    if (photoType) {
      baseQuery += ` AND photo_type = $${paramIdx}`;
      values.push(photoType);
      paramIdx++;
    }

    if (dateFrom) {
      baseQuery += ` AND captured_at >= $${paramIdx}`;
      values.push(new Date(dateFrom));
      paramIdx++;
    }

    if (dateTo) {
      baseQuery += ` AND captured_at <= $${paramIdx}`;
      values.push(new Date(dateTo));
      paramIdx++;
    }

    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countRes = await client.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const itemsQuery = `
      SELECT * ${baseQuery}
      ORDER BY captured_at DESC, created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    values.push(limit, offset);
    const itemsRes = await client.query(itemsQuery, values);

    // Format output mapping columns to camelCase
    const itemsFormatted = itemsRes.rows.map(row => ({
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

    return {
      items: itemsFormatted,
      total,
      page,
      limit
    };
  }

  async delete(photoId, client = pool) {
    const query = `
      DELETE FROM public.attendance_photos
      WHERE photo_id = $1
      RETURNING *
    `;
    const res = await client.query(query, [photoId]);
    return res.rows[0];
  }

  async softDelete(photoId, client = pool) {
    const query = `
      UPDATE public.attendance_photos
      SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
      WHERE photo_id = $1
      RETURNING *
    `;
    const res = await client.query(query, [photoId]);
    return res.rows[0];
  }

  async findLatestPhoto(employeeId, photoType, client = pool) {
    const query = `
      SELECT * FROM public.attendance_photos
      WHERE employee_id = $1 AND photo_type = $2 AND is_deleted = 0
      ORDER BY captured_at DESC, created_at DESC
      LIMIT 1
    `;
    const res = await client.query(query, [employeeId, photoType]);
    return res.rows[0] || null;
  }

  async findByType(attendanceId, photoType, client = pool) {
    const query = `
      SELECT * FROM public.attendance_photos
      WHERE attendance_id = $1 AND photo_type = $2 AND is_deleted = 0
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const res = await client.query(query, [attendanceId, photoType]);
    return res.rows[0] || null;
  }
}

module.exports = new AttendancePhotoRepository();
