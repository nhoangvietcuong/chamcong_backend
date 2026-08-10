const workLocationRepository = require('../repositories/work-location-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { getPagination } = require('../utils/pagination');
const { NotFoundError, ConflictError, BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');
const { getTodayDateString } = require('../utils/date');
const { pool } = require('../config/db');

class WorkLocationService {
  async getWorkLocations(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { keyword, status, sortBy, sortOrder } = queryParams;

    const { items, total } = await workLocationRepository.findAndCount({
      keyword,
      status,
      sortBy,
      sortOrder,
      limit,
      offset: (page - 1) * limit
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination
    };
  }

  async getWorkLocationById(id) {
    const location = await workLocationRepository.findById(id);
    if (!location) {
      throw new NotFoundError('Không tìm thấy địa điểm chấm công', ERROR_CODE.WORK_LOCATION_NOT_FOUND);
    }

    const assignmentsCount = await workLocationRepository.countAssignments(id);
    const futureAssignmentsCount = await workLocationRepository.countFutureAssignments(id, getTodayDateString());

    return {
      ...location,
      assignmentsCount,
      futureAssignmentsCount
    };
  }

  async createWorkLocation(data, authContext) {
    const { locationName, address, latitude, longitude, allowedRadiusMeter, isCompanyLocation = false } = data;

    const trimmedName = locationName ? locationName.trim() : '';
    const trimmedAddress = address ? address.trim() : '';
    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);
    const parsedRadius = parseInt(allowedRadiusMeter, 10);
    const parsedIsCompany = isCompanyLocation === true || isCompanyLocation === 'true' || isCompanyLocation === 1 || isCompanyLocation === '1';

    if (!trimmedName) {
      throw new BadRequestError('Tên địa điểm không được để trống', ERROR_CODE.VALIDATION_ERROR);
    }
    const existingName = await workLocationRepository.findByName(trimmedName);
    if (existingName) {
      throw new ConflictError('Tên địa điểm làm việc đã tồn tại', ERROR_CODE.VALIDATION_ERROR);
    }
    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      throw new BadRequestError('Vĩ độ không hợp lệ', ERROR_CODE.INVALID_LATITUDE);
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      throw new BadRequestError('Kinh độ không hợp lệ', ERROR_CODE.INVALID_LONGITUDE);
    }
    if (isNaN(parsedRadius) || parsedRadius <= 0) {
      throw new BadRequestError('Bán kính cho phép phải lớn hơn 0', ERROR_CODE.INVALID_RADIUS);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newLocation = await workLocationRepository.create({
        locationName: trimmedName,
        address: trimmedAddress,
        latitude: parsedLat,
        longitude: parsedLng,
        allowedRadiusMeter: parsedRadius,
        isCompanyLocation: parsedIsCompany
      }, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_WORK_LOCATION,
        description: `Tạo địa điểm chấm công: ${trimmedName} (${trimmedAddress})`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return newLocation;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateWorkLocation(id, data, authContext) {
    const { locationName, address, latitude, longitude, allowedRadiusMeter, isCompanyLocation } = data;

    const trimmedName = locationName ? locationName.trim() : '';
    const trimmedAddress = address ? address.trim() : '';
    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);
    const parsedRadius = parseInt(allowedRadiusMeter, 10);
    const parsedIsCompany = isCompanyLocation !== undefined ? (isCompanyLocation === true || isCompanyLocation === 'true' || isCompanyLocation === 1 || isCompanyLocation === '1') : undefined;

    if (!trimmedName) {
      throw new BadRequestError('Tên địa điểm không được để trống', ERROR_CODE.VALIDATION_ERROR);
    }
    const existingName = await workLocationRepository.findByName(trimmedName);
    if (existingName && parseInt(existingName.locationId, 10) !== parseInt(id, 10)) {
      throw new ConflictError('Tên địa điểm làm việc đã tồn tại', ERROR_CODE.VALIDATION_ERROR);
    }
    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      throw new BadRequestError('Vĩ độ không hợp lệ', ERROR_CODE.INVALID_LATITUDE);
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      throw new BadRequestError('Kinh độ không hợp lệ', ERROR_CODE.INVALID_LONGITUDE);
    }
    if (isNaN(parsedRadius) || parsedRadius <= 0) {
      throw new BadRequestError('Bán kính cho phép phải lớn hơn 0', ERROR_CODE.INVALID_RADIUS);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const location = await workLocationRepository.findById(id, client);
      if (!location) {
        throw new NotFoundError('Không tìm thấy địa điểm chấm công', ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }

      const updatedLocation = await workLocationRepository.update(id, {
        locationName: trimmedName,
        address: trimmedAddress,
        latitude: parsedLat,
        longitude: parsedLng,
        allowedRadiusMeter: parsedRadius,
        isCompanyLocation: parsedIsCompany
      }, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.UPDATE_WORK_LOCATION,
        description: `Cập nhật địa điểm chấm công ID ${id} thành: ${trimmedName}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return updatedLocation;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateWorkLocationStatus(id, status, authContext) {
    const parsedStatus = parseInt(status, 10);
    if (parsedStatus !== 0 && parsedStatus !== 1) {
      throw new BadRequestError('Trạng thái không hợp lệ', ERROR_CODE.INVALID_STATUS);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const location = await workLocationRepository.findById(id, client);
      if (!location) {
        throw new NotFoundError('Không tìm thấy địa điểm chấm công', ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }

      if (parseInt(location.status, 10) === parsedStatus) {
        await client.query('COMMIT');
        return location;
      }

      if (parsedStatus === 0) {
        // If deactivating, check future assignments
        const activeFutureAssignments = await workLocationRepository.countFutureAssignments(
          id,
          getTodayDateString(),
          client
        );
        if (activeFutureAssignments > 0) {
          throw new ConflictError(
            'Không thể khóa địa điểm đang có phân công hoạt động trong tương lai',
            ERROR_CODE.WORK_LOCATION_HAS_ACTIVE_ASSIGNMENTS
          );
        }
      }

      const updatedLocation = await workLocationRepository.updateStatus(id, parsedStatus, client);

      const action = parsedStatus === 0 ? SYSTEM_ACTION.DEACTIVATE_WORK_LOCATION : SYSTEM_ACTION.ACTIVATE_WORK_LOCATION;
      const desc = parsedStatus === 0 ? `Khóa địa điểm: ${location.locationName}` : `Kích hoạt địa điểm: ${location.locationName}`;

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action,
        description: desc,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return updatedLocation;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  async bulkDeleteWorkLocations(ids, authContext) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError('Danh sách địa điểm không hợp lệ', ERROR_CODE.VALIDATION_ERROR);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Attempt to delete. This may throw a foreign key constraint violation if they have assignments
      const deletedCount = await workLocationRepository.bulkDelete(ids, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: 'DELETE_WORK_LOCATION', // Add action manually if not defined, or use generic
        description: `Xóa hàng loạt ${deletedCount} địa điểm chấm công`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return deletedCount;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23503') {
        throw new ConflictError('Không thể xóa địa điểm vì đã phát sinh dữ liệu (phân ca, chấm công).', ERROR_CODE.VALIDATION_ERROR);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new WorkLocationService();
