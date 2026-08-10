const departmentRepository = require('../repositories/department-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { getPagination } = require('../utils/pagination');
const { NotFoundError, ConflictError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');

class DepartmentService {
  async getDepartments(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { keyword, status, sortBy, sortOrder } = queryParams;
    
    const { items, total } = await departmentRepository.findAndCount({
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

  async getDepartmentById(id) {
    const department = await departmentRepository.findById(id);
    if (!department) {
      throw new NotFoundError('Không tìm thấy phòng ban', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }
    return department;
  }

  async createDepartment(data, authContext) {
    const { departmentName, description } = data;
    
    const trimmedName = departmentName.trim();
    const trimmedDesc = description ? description.trim() : null;

    const existing = await departmentRepository.findByName(trimmedName);
    if (existing) {
      throw new ConflictError('Tên phòng ban đã tồn tại', ERROR_CODE.DEPARTMENT_NAME_EXISTS);
    }

    const newDept = await departmentRepository.create({
      departmentName: trimmedName,
      description: trimmedDesc
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.CREATE_DEPARTMENT,
      description: `Tạo phòng ban: ${trimmedName}`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return newDept;
  }

  async updateDepartment(id, data, authContext) {
    const { departmentName, description } = data;
    
    const trimmedName = departmentName.trim();
    const trimmedDesc = description ? description.trim() : null;

    const dept = await departmentRepository.findById(id);
    if (!dept) {
      throw new NotFoundError('Không tìm thấy phòng ban', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }

    const existing = await departmentRepository.findByName(trimmedName);
    if (existing && parseInt(existing.department_id, 10) !== parseInt(id, 10)) {
      throw new ConflictError('Tên phòng ban đã tồn tại', ERROR_CODE.DEPARTMENT_NAME_EXISTS);
    }

    const updatedDept = await departmentRepository.update(id, {
      departmentName: trimmedName,
      description: trimmedDesc
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.UPDATE_DEPARTMENT,
      description: `Cập nhật phòng ban ID ${id} thành: ${trimmedName}`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return updatedDept;
  }

  async updateDepartmentStatus(id, status, authContext) {
    const dept = await departmentRepository.findById(id);
    if (!dept) {
      throw new NotFoundError('Không tìm thấy phòng ban', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }

    const currentStatus = parseInt(dept.status, 10);
    const newStatus = parseInt(status, 10);

    if (currentStatus === newStatus) {
      return dept;
    }

    if (newStatus === 0) {
      const activeCount = await departmentRepository.countActiveEmployees(id);
      if (activeCount > 0) {
        throw new ConflictError(
          'Không thể khóa phòng ban đang có nhân viên hoạt động',
          ERROR_CODE.DEPARTMENT_HAS_ACTIVE_EMPLOYEES
        );
      }
    }

    const updatedDept = await departmentRepository.updateStatus(id, newStatus);

    const action = newStatus === 0 ? SYSTEM_ACTION.DEACTIVATE_DEPARTMENT : SYSTEM_ACTION.ACTIVATE_DEPARTMENT;
    const actionDesc = newStatus === 0 ? `Khóa phòng ban: ${dept.department_name}` : `Mở khóa phòng ban: ${dept.department_name}`;

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action,
      description: actionDesc,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return updatedDept;
  }
}

module.exports = new DepartmentService();
