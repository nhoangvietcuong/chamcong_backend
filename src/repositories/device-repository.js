const { pool } = require('../config/db');

class DeviceRepository {
  async upsertDevice(employeeId, deviceFingerprint, deviceName, dbClient = pool) {
    const queryText = `
      INSERT INTO public.registered_devices (
        employee_id,
        device_fingerprint,
        device_name,
        is_verified,
        registered_at,
        last_used_at
      ) VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, device_fingerprint) 
      DO UPDATE SET 
        last_used_at = CURRENT_TIMESTAMP,
        device_name = COALESCE($3, public.registered_devices.device_name)
      RETURNING device_id;
    `;
    const res = await dbClient.query(queryText, [employeeId, deviceFingerprint, deviceName]);
    return res.rows[0];
  }
}

module.exports = new DeviceRepository();
