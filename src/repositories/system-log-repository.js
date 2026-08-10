const { pool } = require('../config/db');

class SystemLogRepository {
  async createLog(logData, dbClient = pool) {
    const client = dbClient || pool;
    const {
      employeeId,
      accountId,
      action,
      description,
      deviceFingerprint,
      ipAddress,
      status,
    } = logData;

    const queryText = `
      INSERT INTO public.system_logs (
        employee_id,
        account_id,
        action,
        description,
        device_fingerprint,
        ip_address,
        status,
        action_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING log_id;
    `;
    const res = await client.query(queryText, [
      employeeId,
      accountId,
      action,
      description,
      deviceFingerprint,
      ipAddress,
      status,
    ]);
    return res.rows[0];
  }
}

module.exports = new SystemLogRepository();
