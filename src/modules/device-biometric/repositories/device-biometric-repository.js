const { pool } = require('../../../config/db');

class DeviceBiometricRepository {
  async createCredential(data, dbClient = pool) {
    const client = dbClient || pool;
    const {
      credentialId,
      employeeId,
      credentialPublicKey,
      credentialCounter = 0,
      credentialDeviceName,
      credentialType = 'public-key',
      transports = [],
      aaguid,
    } = data;

    const queryText = `
      INSERT INTO public.employee_webauthn_credentials (
        credential_id,
        employee_id,
        credential_public_key,
        credential_counter,
        credential_device_name,
        credential_type,
        transports,
        aaguid,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const res = await client.query(queryText, [
      credentialId,
      employeeId,
      credentialPublicKey,
      credentialCounter,
      credentialDeviceName,
      credentialType,
      JSON.stringify(transports),
      aaguid,
    ]);

    return res.rows[0];
  }

  async findCredential(credentialId, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = `
      SELECT * FROM public.employee_webauthn_credentials
      WHERE credential_id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const res = await client.query(queryText, [credentialId]);
    return res.rows[0];
  }

  async findByEmployee(employeeId, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = `
      SELECT * FROM public.employee_webauthn_credentials
      WHERE employee_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC;
    `;
    const res = await client.query(queryText, [employeeId]);
    return res.rows;
  }

  async updateCounter(credentialId, counter, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = `
      UPDATE public.employee_webauthn_credentials
      SET 
        credential_counter = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE credential_id = $1 AND deleted_at IS NULL
      RETURNING *;
    `;
    const res = await client.query(queryText, [credentialId, counter]);
    return res.rows[0];
  }

  async softDelete(credentialId, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = `
      UPDATE public.employee_webauthn_credentials
      SET 
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE credential_id = $1 AND deleted_at IS NULL
      RETURNING *;
    `;
    const res = await client.query(queryText, [credentialId]);
    return res.rows[0];
  }

  async findAndCountAdminCredentials(filters, dbClient = pool) {
    const { page = 1, limit = 10, keyword, status } = filters;
    const offset = (page - 1) * limit;
    const params = [];
    const countParams = [];

    let whereClauses = [];

    if (status !== undefined && status !== '') {
      if (status === '1') {
        whereClauses.push('ewc.deleted_at IS NULL');
      } else {
        whereClauses.push('ewc.deleted_at IS NOT NULL');
      }
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      countParams.push(`%${keyword}%`);
      whereClauses.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR ewc.credential_device_name ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.employee_webauthn_credentials ewc
      JOIN public.employees e ON ewc.employee_id = e.employee_id
      ${whereStr}
    `, countParams);

    params.push(limit, offset);
    const dataRes = await dbClient.query(`
      SELECT 
        ewc.credential_id,
        ewc.employee_id,
        ewc.credential_device_name,
        ewc.credential_type,
        ewc.created_at,
        ewc.updated_at,
        ewc.deleted_at,
        e.employee_code,
        e.full_name as employee_full_name,
        d.department_name
      FROM public.employee_webauthn_credentials ewc
      JOIN public.employees e ON ewc.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      ${whereStr}
      ORDER BY ewc.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: dataRes.rows.map(row => ({
        credentialId: row.credential_id,
        employeeId: parseInt(row.employee_id, 10),
        credentialName: row.credential_device_name,
        authenticator: 'Platform (Internal)', // Default mockup
        residentKey: 'true',
        userVerification: 'required',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.updated_at, // Use updated_at as proxy for last used in mockup
        status: row.deleted_at ? 0 : 1,
        employee: {
          employeeCode: row.employee_code,
          fullName: row.employee_full_name,
          departmentName: row.department_name
        }
      })),
      total: countRes.rows[0].total
    };
  }

  async updateStatusAdmin(credentialId, status, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = status === 1
      ? `UPDATE public.employee_webauthn_credentials SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE credential_id = $1 RETURNING *`
      : `UPDATE public.employee_webauthn_credentials SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE credential_id = $1 RETURNING *`;
    const res = await client.query(queryText, [credentialId]);
    return res.rows[0];
  }

  async revokeCredentialAdmin(credentialId, dbClient = pool) {
    const client = dbClient || pool;
    const queryText = `
      DELETE FROM public.employee_webauthn_credentials WHERE credential_id = $1 RETURNING *
    `;
    const res = await client.query(queryText, [credentialId]);
    return res.rows[0];
  }
}

module.exports = new DeviceBiometricRepository();
