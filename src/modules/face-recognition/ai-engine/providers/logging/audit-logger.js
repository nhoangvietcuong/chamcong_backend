const IAuditLogger = require('../../interfaces/audit-logger.interface');
const systemLogRepository = require('../../../../../repositories/system-log-repository');

class AuditLoggerProvider extends IAuditLogger {
  /**
   * Logs an audit record to the system_logs table.
   */
  async log(logData, dbClient) {
    try {
      await systemLogRepository.createLog(logData, dbClient);
    } catch (err) {
      console.error('⚠️ Failed to write audit log in AI Engine:', err.message);
    }
  }
}

module.exports = new AuditLoggerProvider();
