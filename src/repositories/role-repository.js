const { pool } = require('../config/db');

class RoleRepository {
  async findAll(dbClient = pool) {
    const queryText = `
      SELECT role_id AS "roleId", role_name AS "roleName", description
      FROM public.roles
      ORDER BY role_id ASC;
    `;
    const res = await dbClient.query(queryText);
    return res.rows;
  }

  async findById(roleId, dbClient = pool) {
    const queryText = `
      SELECT role_id AS "roleId", role_name AS "roleName", description
      FROM public.roles
      WHERE role_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [roleId]);
    return res.rows[0];
  }
}

module.exports = new RoleRepository();
