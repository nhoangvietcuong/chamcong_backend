const { pool } = require('../config/db');

class AccountRepository {
  async findByUsername(username, dbClient = pool) {
    const queryText = `
      SELECT 
        a.account_id, 
        a.employee_id, 
        a.username, 
        a.password_hash, 
        a.role_id, 
        a.is_active,
        a.require_password_change,
        e.employee_code, 
        e.full_name, 
        e.email, 
        e.phone, 
        e.status AS employee_status,
        e.department_id,
        e.avatar_url,
        d.department_name,
        r.role_name
      FROM public.accounts a
      JOIN public.employees e ON a.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE LOWER(a.username) = LOWER($1)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [username]);
    return res.rows[0];
  }

  async findById(accountId, dbClient = pool) {
    const queryText = `
      SELECT 
        a.account_id, 
        a.employee_id, 
        a.username, 
        a.role_id, 
        a.is_active,
        a.require_password_change,
        e.employee_code, 
        e.full_name, 
        e.email, 
        e.phone, 
        e.status AS employee_status,
        e.department_id,
        e.avatar_url,
        d.department_name,
        r.role_name
      FROM public.accounts a
      JOIN public.employees e ON a.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE a.account_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [accountId]);
    return res.rows[0];
  }

  async lockAccount(accountId, dbClient) {
    const queryText = `
      SELECT account_id 
      FROM public.accounts 
      WHERE account_id = $1 
      FOR UPDATE;
    `;
    await dbClient.query(queryText, [accountId]);
  }

  async findByEmployeeId(employeeId, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.accounts
      WHERE employee_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId]);
    return res.rows[0];
  }

  async create(data, dbClient = pool) {
    const { employeeId, username, passwordHash, roleId } = data;
    const queryText = `
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, 1)
      RETURNING account_id, employee_id, username, role_id, is_active;
    `;
    const res = await dbClient.query(queryText, [employeeId, username, passwordHash, roleId]);
    return res.rows[0];
  }

  async updateRole(accountId, roleId, dbClient = pool) {
    const queryText = `
      UPDATE public.accounts
      SET role_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $2
      RETURNING account_id, employee_id, username, role_id, is_active;
    `;
    const res = await dbClient.query(queryText, [roleId, accountId]);
    return res.rows[0];
  }

  async updateStatus(accountId, isActive, dbClient = pool) {
    const queryText = `
      UPDATE public.accounts
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $2
      RETURNING account_id, employee_id, username, role_id, is_active;
    `;
    const res = await dbClient.query(queryText, [isActive, accountId]);
    return res.rows[0];
  }

  async resetPassword(accountId, passwordHash, requirePasswordChange = true, dbClient = pool) {
    const queryText = `
      UPDATE public.accounts
      SET password_hash = $1, require_password_change = $2, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $3
      RETURNING account_id, employee_id, username, role_id, is_active, require_password_change;
    `;
    const res = await dbClient.query(queryText, [passwordHash, requirePasswordChange, accountId]);
    return res.rows[0];
  }

  async updateUsername(accountId, username, dbClient = pool) {
    const queryText = `
      UPDATE public.accounts
      SET username = $1, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $2
      RETURNING account_id, employee_id, username, role_id, is_active;
    `;
    const res = await dbClient.query(queryText, [username, accountId]);
    return res.rows[0];
  }


  async countActiveAdmins(dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int AS count
      FROM public.accounts a
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE r.role_name = 'ADMIN' AND a.is_active = 1;
    `;
    const res = await dbClient.query(queryText);
    return res.rows[0].count;
  }

  async countActiveSupmanagers(dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int AS count
      FROM public.accounts a
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE r.role_name = 'SUPMANAGER' AND a.is_active = 1;
    `;
    const res = await dbClient.query(queryText);
    return res.rows[0].count;
  }

  async findAndCount(filters, dbClient = pool) {
    const { limit = 10, offset = 0 } = filters;
    const countRes = await dbClient.query('SELECT COUNT(*)::int AS total FROM public.accounts');
    const dataRes = await dbClient.query(`
      SELECT a.account_id, a.username, a.is_active, r.role_name, e.full_name, e.employee_code
      FROM public.accounts a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.roles r ON a.role_id = r.role_id
      ORDER BY a.account_id DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return {
      items: dataRes.rows.map(r => ({
        accountId: parseInt(r.account_id, 10),
        username: r.username,
        isActive: parseInt(r.is_active, 10),
        roleName: r.role_name,
        employee: {
          fullName: r.full_name,
          employeeCode: r.employee_code
        }
      })),
      total: countRes.rows[0].total
    };
  }

  async getPasswordHashById(accountId, dbClient = pool) {
    const queryText = 'SELECT password_hash FROM public.accounts WHERE account_id = $1 LIMIT 1;';
    const res = await dbClient.query(queryText, [accountId]);
    return res.rows[0]?.password_hash || null;
  }
}

module.exports = new AccountRepository();
