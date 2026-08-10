const db = require('../config/db');
const { AppError } = require('../errors/app-error');

class HealthController {
  checkHealth(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        message: 'Hệ thống hoạt động bình thường',
        data: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async checkDatabase(req, res, next) {
    try {
      await db.query('SELECT 1');
      
      res.status(200).json({
        success: true,
        message: 'Kết nối database thành công',
        data: {
          status: 'connected'
        }
      });
    } catch (err) {
      const dbError = new AppError('Không thể kết nối đến cơ sở dữ liệu', 500, 'DATABASE_CONNECTION_ERROR');
      next(dbError);
    }
  }
}

module.exports = new HealthController();
