const { pool } = require('../config/db');

class EmployeeRepository {
  async findAndCount(filters, dbClient = pool) {
    const { keyword, departmentId, status, hasAccount, role, sortBy, sortOrder, limit, offset } = filters;
    
    let baseQuery = `
      SELECT 
        e.employee_id, 
        e.employee_code, 
        e.full_name, 
        e.email, 
        e.phone, 
        e.status,
        d.department_id, 
        d.department_name,
        a.account_id, 
        a.username, 
        a.is_active AS account_active,
        r.role_name,
        (fp.face_profile_id IS NOT NULL AND fp.status = 1) AS has_face_profile
      FROM public.employees e
      JOIN public.departments d ON e.department_id = d.department_id
      LEFT JOIN public.accounts a ON e.employee_id = a.employee_id
      LEFT JOIN public.roles r ON a.role_id = r.role_id
      LEFT JOIN public.employee_face_profiles fp ON e.employee_id = fp.employee_id AND fp.status = 1
    `;
    
    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.employees e
      JOIN public.departments d ON e.department_id = d.department_id
      LEFT JOIN public.accounts a ON e.employee_id = a.employee_id
      LEFT JOIN public.roles r ON a.role_id = r.role_id
      LEFT JOIN public.employee_face_profiles fp ON e.employee_id = fp.employee_id AND fp.status = 1
    `;
    
    const whereClauses = [];
    const queryParams = [];
    
    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClauses.push(`(
        LOWER(e.employee_code) LIKE LOWER($${queryParams.length}) OR
        LOWER(e.full_name) LIKE LOWER($${queryParams.length}) OR
        LOWER(e.email) LIKE LOWER($${queryParams.length}) OR
        e.phone LIKE $${queryParams.length}
      )`);
    }
    
    if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
      queryParams.push(parseInt(departmentId, 10));
      whereClauses.push(`e.department_id = $${queryParams.length}`);
    }
    
    if (status !== undefined && status !== null && status !== '') {
      queryParams.push(parseInt(status, 10));
      whereClauses.push(`e.status = $${queryParams.length}`);
    }
    
    if (hasAccount !== undefined && hasAccount !== null && hasAccount !== '') {
      const isTrue = hasAccount === 'true' || hasAccount === true || hasAccount === '1' || hasAccount === 1;
      if (isTrue) {
        whereClauses.push(`a.account_id IS NOT NULL`);
      } else {
        whereClauses.push(`a.account_id IS NULL`);
      }
    }
    
    if (role) {
      queryParams.push(role);
      whereClauses.push(`r.role_name = $${queryParams.length}`);
    }
    
    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }
    
    const allowedSortBy = ['employee_id', 'employee_code', 'full_name', 'email', 'status', 'created_at'];
    const finalSortBy = allowedSortBy.includes(sortBy) ? `e.${sortBy}` : 'e.employee_id';
    
    const allowedSortOrder = ['ASC', 'DESC'];
    const finalSortOrder = allowedSortOrder.includes(sortOrder?.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';
    
    baseQuery += ` ORDER BY ${finalSortBy} ${finalSortOrder}`;
    
    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;
    
    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;
    
    const itemsPromise = dbClient.query(baseQuery, queryParams);
    
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);
    
    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);
    
    const items = itemsRes.rows.map(row => ({
      employeeId: parseInt(row.employee_id, 10),
      employeeCode: row.employee_code,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      department: {
        departmentId: parseInt(row.department_id, 10),
        departmentName: row.department_name,
      },
      status: parseInt(row.status, 10),
      hasFaceProfile: !!row.has_face_profile,
      account: row.account_id ? {
        accountId: parseInt(row.account_id, 10),
        username: row.username,
        role: row.role_name,
        isActive: parseInt(row.account_active, 10),
      } : null
    }));
    
    return {
      items,
      total: countRes.rows[0].total,
    };
  }

  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        e.employee_id, 
        e.employee_code, 
        e.full_name, 
        e.email, 
        e.phone, 
        e.status,
        e.avatar_url,
        d.department_id, 
        d.department_name,
        a.account_id, 
        a.username, 
        a.is_active AS account_active,
        r.role_name
      FROM public.employees e
      JOIN public.departments d ON e.department_id = d.department_id
      LEFT JOIN public.accounts a ON e.employee_id = a.employee_id
      LEFT JOIN public.roles r ON a.role_id = r.role_id
      WHERE e.employee_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    if (!res.rows[0]) return null;
    
    const row = res.rows[0];
    return {
      employeeId: parseInt(row.employee_id, 10),
      employeeCode: row.employee_code,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      avatarUrl: row.avatar_url || null,
      department: {
        departmentId: parseInt(row.department_id, 10),
        departmentName: row.department_name,
      },
      status: parseInt(row.status, 10),
      account: row.account_id ? {
        accountId: parseInt(row.account_id, 10),
        username: row.username,
        role: row.role_name,
        isActive: parseInt(row.account_active, 10),
      } : null
    };
  }

  async findByCode(code, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employees
      WHERE LOWER(employee_code) = LOWER($1)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [code]);
    return res.rows[0];
  }

  async findByEmail(email, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employees
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [email]);
    return res.rows[0];
  }

  async findByPhone(phone, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employees
      WHERE phone = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [phone]);
    return res.rows[0];
  }

  async getNextCode(roleName = 'EMPLOYEE', dbClient = pool) {
    const ROLE_PREFIX = {
      EMPLOYEE: 'NV',
      MANAGER: 'MNG',
      ADMIN: 'ADM',
      SUPMANAGER: 'SUP',
    };
    const prefix = ROLE_PREFIX[roleName?.toUpperCase()] || 'NV';
    const queryText = `
      SELECT MAX(
        CASE 
          WHEN employee_code ~ ('^' || $1 || '[0-9]+$') THEN SUBSTRING(employee_code FROM (LENGTH($1) + 1))::INTEGER
          WHEN $1 = 'NV' AND employee_code ~ '^[0-9]+$' THEN employee_code::INTEGER
          ELSE 0
        END
      ) AS max_num FROM public.employees;
    `;
    const res = await dbClient.query(queryText, [prefix]);
    const maxNum = res.rows[0]?.max_num || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  async create(data, dbClient = pool) {
    const { employeeCode, fullName, email, phone, departmentId } = data;
    const queryText = `
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ($1, $2, $3, $4, $5, 1)
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [employeeCode, fullName, email, phone, departmentId]);
    return res.rows[0];
  }

  async update(id, data, dbClient = pool) {
    const { fullName, email, phone, departmentId } = data;
    const queryText = `
      UPDATE public.employees
      SET full_name = $1, email = $2, phone = $3, department_id = $4, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $5
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [fullName, email, phone, departmentId, id]);
    return res.rows[0];
  }

  async updateStatus(id, status, dbClient = pool) {
    const queryText = `
      UPDATE public.employees
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $2
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [status, id]);
    return res.rows[0];
  }

  async updateSelfProfile(id, data, dbClient = pool) {
    const { email, phone } = data;
    const queryText = `
      UPDATE public.employees
      SET email = $1, phone = $2, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $3
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [email, phone, id]);
    return res.rows[0];
  }

  async updateAvatarUrl(id, avatarUrl, dbClient = pool) {
    const queryText = `
      UPDATE public.employees
      SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $2
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [avatarUrl, id]);
    return res.rows[0];
  }
}

module.exports = new EmployeeRepository();
