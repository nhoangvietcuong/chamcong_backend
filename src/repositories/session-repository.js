const { pool } = require('../config/db');

class SessionRepository {
  async findActiveByAccountId(accountId, dbClient = pool) {
    const queryText = `
      SELECT session_id, account_id, employee_id, device_fingerprint, session_status, expires_at
      FROM public.user_sessions
      WHERE account_id = $1 AND session_status = 'ACTIVE'
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [accountId]);
    return res.rows[0];
  }

  async findActiveByAccountIdAndDevice(accountId, deviceFingerprint, dbClient = pool) {
    const queryText = `
      SELECT session_id, account_id, employee_id, device_fingerprint, session_status, expires_at
      FROM public.user_sessions
      WHERE account_id = $1 AND device_fingerprint = $2 AND session_status = 'ACTIVE'
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [accountId, deviceFingerprint]);
    return res.rows[0];
  }

  async findById(sessionId, dbClient = pool) {
    const queryText = `
      SELECT session_id, account_id, employee_id, device_fingerprint, session_status, expires_at
      FROM public.user_sessions
      WHERE session_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [sessionId]);
    return res.rows[0];
  }

  async deactivateSession(sessionId, status, dbClient = pool) {
    const queryText = `
      UPDATE public.user_sessions
      SET 
        session_status = $2,
        logout_at = CURRENT_TIMESTAMP,
        refresh_token_hash = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
      RETURNING session_id;
    `;
    const res = await dbClient.query(queryText, [sessionId, status]);
    return res.rows[0];
  }

  async createSession(sessionData, dbClient = pool) {
    const {
      accountId,
      employeeId,
      deviceFingerprint,
      deviceName,
      ipAddress,
      expiresAt,
      refreshTokenHash,
    } = sessionData;

    const queryText = `
      INSERT INTO public.user_sessions (
        account_id,
        employee_id,
        device_fingerprint,
        device_name,
        ip_address,
        expires_at,
        session_status,
        refresh_token_hash,
        login_at,
        last_activity_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING session_id, account_id, employee_id, device_fingerprint, session_status, expires_at;
    `;
    const res = await dbClient.query(queryText, [
      accountId,
      employeeId,
      deviceFingerprint,
      deviceName,
      ipAddress,
      expiresAt,
      refreshTokenHash,
    ]);
    return res.rows[0];
  }

  async findSessionAndUserByRefreshTokenHash(hash, dbClient = pool) {
    const queryText = `
      SELECT 
        s.session_id,
        s.account_id,
        s.employee_id,
        s.device_fingerprint,
        s.session_status,
        s.expires_at,
        s.refresh_token_hash,
        a.is_active AS account_active,
        e.status AS employee_status,
        r.role_name
      FROM public.user_sessions s
      JOIN public.accounts a ON s.account_id = a.account_id
      JOIN public.employees e ON s.employee_id = e.employee_id
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE s.refresh_token_hash = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [hash]);
    return res.rows[0];
  }

  async updateLastActivity(sessionId, dbClient = pool) {
    const queryText = `
      UPDATE public.user_sessions
      SET 
        last_activity_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1;
    `;
    await dbClient.query(queryText, [sessionId]);
  }

  async revokeSessionsByAccountId(accountId, dbClient = pool) {
    const queryText = `
      UPDATE public.user_sessions
      SET 
        session_status = 'REVOKED',
        logout_at = CURRENT_TIMESTAMP,
        refresh_token_hash = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1 AND session_status = 'ACTIVE';
    `;
    await dbClient.query(queryText, [accountId]);
  }

  async revokeSessionsByEmployeeId(employeeId, dbClient = pool) {
    const queryText = `
      UPDATE public.user_sessions
      SET 
        session_status = 'REVOKED',
        logout_at = CURRENT_TIMESTAMP,
        refresh_token_hash = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $1 AND session_status = 'ACTIVE';
    `;
    await dbClient.query(queryText, [employeeId]);
  }

  async findAndCountDevices(filters, dbClient = pool) {
    const { page = 1, limit = 10, keyword, status } = filters;
    const offset = (page - 1) * limit;
    const params = [];
    const countParams = [];

    let whereClauses = [];

    if (status !== undefined && status !== '') {
      if (status === 'ACTIVE') {
        whereClauses.push(`s.session_status = 'ACTIVE'`);
      } else {
        whereClauses.push(`s.session_status != 'ACTIVE'`);
      }
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      countParams.push(`%${keyword}%`);
      whereClauses.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR s.device_name ILIKE $${params.length} OR s.device_fingerprint ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.user_sessions s
      JOIN public.employees e ON s.employee_id = e.employee_id
      ${whereStr}
    `, countParams);

    params.push(limit, offset);
    const dataRes = await dbClient.query(`
      SELECT 
        s.session_id,
        s.employee_id,
        s.device_name,
        s.device_fingerprint,
        s.ip_address,
        s.session_status,
        s.login_at,
        s.last_activity_at,
        s.updated_at,
        e.employee_code,
        e.full_name as employee_full_name,
        d.department_name
      FROM public.user_sessions s
      JOIN public.employees e ON s.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      ${whereStr}
      ORDER BY s.login_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: dataRes.rows.map(row => {
        // Parse device name for OS and browser mockup in UI
        const deviceName = row.device_name || '';
        let browser = 'Chrome 125.0.0';
        let os = 'Windows 11';
        if (deviceName) {
          const parts = deviceName.split(' on ');
          if (parts.length > 0) browser = parts[0];
          if (parts.length > 1) os = parts[1];
        }

        return {
          deviceId: row.session_id,
          employeeId: parseInt(row.employee_id, 10),
          deviceName: row.device_name || 'Thiết bị chưa rõ',
          browser,
          operatingSystem: os,
          platform: 'Win32',
          fingerprint: row.device_fingerprint || 'N/A',
          registeredTime: row.login_at,
          lastLogin: row.last_activity_at || row.updated_at,
          status: row.session_status === 'ACTIVE' ? 1 : 0,
          employee: {
            employeeCode: row.employee_code,
            fullName: row.employee_full_name,
            departmentName: row.department_name
          }
        };
      }),
      total: countRes.rows[0].total
    };
  }

  async updateSessionStatusAdmin(sessionId, status, dbClient = pool) {
    const sessionStatus = status === 1 ? 'ACTIVE' : 'REVOKED';
    const queryText = `
      UPDATE public.user_sessions
      SET 
        session_status = $1,
        refresh_token_hash = CASE WHEN $1 = 'REVOKED' THEN NULL ELSE refresh_token_hash END,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $2
      RETURNING *
    `;
    const res = await dbClient.query(queryText, [sessionStatus, sessionId]);
    return res.rows[0];
  }

  async deleteSessionAdmin(sessionId, dbClient = pool) {
    const queryText = `
      DELETE FROM public.user_sessions WHERE session_id = $1 RETURNING *
    `;
    const res = await dbClient.query(queryText, [sessionId]);
    return res.rows[0];
  }
}

module.exports = new SessionRepository();
