const { pool } = require('../../../config/db');

class FaceProfileRepository {
  async createFaceProfile(data, dbClient = pool) {
    const { employeeId, embedding, embeddingVersion, provider } = data;
    const queryText = `
      INSERT INTO public.employee_face_profiles (
        employee_id,
        embedding,
        embedding_version,
        provider,
        status,
        registered_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      employeeId,
      JSON.stringify(embedding),
      embeddingVersion,
      provider
    ]);
    return this._mapRow(res.rows[0]);
  }

  async updateFaceProfile(id, data, dbClient = pool) {
    const { embedding, embeddingVersion, provider } = data;
    const queryText = `
      UPDATE public.employee_face_profiles
      SET 
        embedding = $1,
        embedding_version = $2,
        provider = $3,
        status = 1,
        updated_at = CURRENT_TIMESTAMP,
        deleted_at = NULL
      WHERE face_profile_id = $4
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      JSON.stringify(embedding),
      embeddingVersion,
      provider,
      id
    ]);
    return this._mapRow(res.rows[0]);
  }

  async findByEmployeeId(employeeId, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employee_face_profiles
      WHERE employee_id = $1;
    `;
    const res = await dbClient.query(queryText, [employeeId]);
    return res.rows.map(row => this._mapRow(row));
  }

  async findActiveProfile(employeeId, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employee_face_profiles
      WHERE employee_id = $1 AND status = 1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId]);
    if (!res.rows[0]) return null;
    return this._mapRow(res.rows[0]);
  }

  async softDelete(employeeId, dbClient = pool) {
    const queryText = `
      UPDATE public.employee_face_profiles
      SET 
        status = 0,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $1 AND status = 1
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [employeeId]);
    if (!res.rows[0]) return null;
    return this._mapRow(res.rows[0]);
  }

  async updateEmbedding(employeeId, embedding, version, provider, dbClient = pool) {
    const queryText = `
      UPDATE public.employee_face_profiles
      SET 
        embedding = $1,
        embedding_version = $2,
        provider = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $4 AND status = 1
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      JSON.stringify(embedding),
      version,
      provider,
      employeeId
    ]);
    if (!res.rows[0]) return null;
    return this._mapRow(res.rows[0]);
  }

  async updateMetadata(employeeId, metadata, dbClient = pool) {
    // Schema has no metadata column, return active profile details
    return this.findActiveProfile(employeeId, dbClient);
  }

  _mapRow(row) {
    if (!row) return null;
    return {
      faceProfileId: parseInt(row.face_profile_id, 10),
      employeeId: parseInt(row.employee_id, 10),
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
      embeddingVersion: row.embedding_version,
      provider: row.provider,
      status: parseInt(row.status, 10),
      registeredAt: row.registered_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at
    };
  }

  async findAndCountAdminFaceProfiles(filters, dbClient = pool) {
    const { page = 1, limit = 10, keyword, status } = filters;
    const offset = (page - 1) * limit;
    const params = [];
    const countParams = [];

    let whereClauses = ['efp.deleted_at IS NULL'];

    if (status !== undefined && status !== '') {
      params.push(parseInt(status, 10));
      countParams.push(parseInt(status, 10));
      whereClauses.push(`efp.status = $${params.length}`);
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      countParams.push(`%${keyword}%`);
      whereClauses.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.employee_face_profiles efp
      JOIN public.employees e ON efp.employee_id = e.employee_id
      ${whereStr}
    `, countParams);

    params.push(limit, offset);
    const dataRes = await dbClient.query(`
      SELECT 
        efp.face_profile_id,
        efp.employee_id,
        efp.embedding_version,
        efp.provider,
        efp.status,
        efp.registered_at,
        efp.updated_at,
        e.employee_code,
        e.full_name as employee_full_name,
        d.department_name
      FROM public.employee_face_profiles efp
      JOIN public.employees e ON efp.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      ${whereStr}
      ORDER BY efp.face_profile_id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: dataRes.rows.map(row => ({
        faceProfileId: parseInt(row.face_profile_id, 10),
        employeeId: parseInt(row.employee_id, 10),
        embeddingVersion: row.embedding_version,
        provider: row.provider,
        status: parseInt(row.status, 10),
        registeredAt: row.registered_at,
        updatedAt: row.updated_at,
        employee: {
          employeeCode: row.employee_code,
          fullName: row.employee_full_name,
          departmentName: row.department_name
        }
      })),
      total: countRes.rows[0].total
    };
  }

  async updateStatusAdmin(profileId, status, dbClient = pool) {
    const res = await dbClient.query(`
      UPDATE public.employee_face_profiles
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE face_profile_id = $2
      RETURNING *
    `, [status, profileId]);
    return this._mapRow(res.rows[0]);
  }

  async deleteProfileAdmin(profileId, dbClient = pool) {
    const res = await dbClient.query(`
      UPDATE public.employee_face_profiles
      SET status = 0, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE face_profile_id = $1
      RETURNING *
    `, [profileId]);
    return this._mapRow(res.rows[0]);
  }
}

module.exports = new FaceProfileRepository();
