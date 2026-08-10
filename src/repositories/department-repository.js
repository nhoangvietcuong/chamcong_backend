const { pool } = require('../config/db');

class DepartmentRepository {
  async findAndCount(filters, dbClient = pool) {
    const { keyword, status, sortBy, sortOrder, limit, offset } = filters;
    
    let queryText = 'SELECT * FROM public.departments';
    let countQueryText = 'SELECT COUNT(*)::int as total FROM public.departments';
    
    const whereClauses = [];
    const queryParams = [];
    
    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClauses.push(`LOWER(department_name) LIKE LOWER($${queryParams.length})`);
    }
    
    if (status !== undefined && status !== null) {
      queryParams.push(parseInt(status, 10));
      whereClauses.push(`status = $${queryParams.length}`);
    }
    
    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      queryText += whereString;
      countQueryText += whereString;
    }
    
    const allowedSortBy = ['department_id', 'department_name', 'status', 'created_at'];
    const finalSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'department_id';
    
    const allowedSortOrder = ['ASC', 'DESC'];
    const finalSortOrder = allowedSortOrder.includes(sortOrder?.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';
    
    queryText += ` ORDER BY ${finalSortBy} ${finalSortOrder}`;
    
    queryParams.push(limit);
    queryText += ` LIMIT $${queryParams.length}`;
    
    queryParams.push(offset);
    queryText += ` OFFSET $${queryParams.length}`;
    
    const itemsPromise = dbClient.query(queryText, queryParams);
    
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQueryText, countParams);
    
    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);
    
    return {
      items: itemsRes.rows,
      total: countRes.rows[0].total,
    };
  }

  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT d.department_id, d.department_name, d.description, d.status, d.created_at, d.updated_at,
             COUNT(e.employee_id)::int AS employee_count
      FROM public.departments d
      LEFT JOIN public.employees e ON d.department_id = e.department_id
      WHERE d.department_id = $1
      GROUP BY d.department_id;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async findByName(name, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.departments
      WHERE LOWER(department_name) = LOWER($1)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [name]);
    return res.rows[0];
  }

  async create(data, dbClient = pool) {
    const { departmentName, description } = data;
    const queryText = `
      INSERT INTO public.departments (department_name, description, status)
      VALUES ($1, $2, 1)
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [departmentName, description]);
    return res.rows[0];
  }

  async update(id, data, dbClient = pool) {
    const { departmentName, description } = data;
    const queryText = `
      UPDATE public.departments
      SET department_name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
      WHERE department_id = $3
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [departmentName, description, id]);
    return res.rows[0];
  }

  async updateStatus(id, status, dbClient = pool) {
    const queryText = `
      UPDATE public.departments
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE department_id = $2
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [status, id]);
    return res.rows[0];
  }

  async countActiveEmployees(id, dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int as active_count
      FROM public.employees
      WHERE department_id = $1 AND status = 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0].active_count;
  }
}

module.exports = new DepartmentRepository();
