const employeeAssignmentService = require('../services/employee-assignment-service');

class EmployeeAssignmentController {
  async getTodayAssignment(req, res, next) {
    try {
      const employeeId = req.auth.employeeId;
      const assignment = await employeeAssignmentService.getTodayAssignment(employeeId);
      
      if (!assignment) {
        return res.status(200).json({
          success: true,
          message: 'Chưa có phân công chấm công hôm nay',
          data: null
        });
      }

      res.status(200).json({
        success: true,
        message: 'Lấy phân công hôm nay thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async getPersonalAssignmentById(req, res, next) {
    try {
      const employeeId = req.auth.employeeId;
      const assignment = await employeeAssignmentService.getPersonalAssignmentById(req.params.id, employeeId);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết phân công thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async getPersonalAssignmentsHistory(req, res, next) {
    try {
      const employeeId = req.auth.employeeId;
      const result = await employeeAssignmentService.getPersonalAssignmentsHistory(employeeId, req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy lịch sử phân công thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EmployeeAssignmentController();
