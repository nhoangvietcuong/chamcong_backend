const { pool } = require('../config/db');

class ShiftRepository {
  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        shift_id AS "shiftId",
        shift_code AS "shiftCode",
        shift_name AS "shiftName",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        late_grace_minutes AS "lateGraceMinutes",
        early_leave_grace_minutes AS "earlyLeaveGraceMinutes",
        minimum_work_minutes AS "minimumWorkMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.work_shifts
      WHERE shift_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0] || null;
  }

  async findByCode(code, dbClient = pool) {
    const queryText = `
      SELECT 
        shift_id AS "shiftId",
        shift_code AS "shiftCode",
        shift_name AS "shiftName",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        late_grace_minutes AS "lateGraceMinutes",
        early_leave_grace_minutes AS "earlyLeaveGraceMinutes",
        minimum_work_minutes AS "minimumWorkMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.work_shifts
      WHERE shift_code = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [code]);
    return res.rows[0] || null;
  }

  async findAndCount(filters, dbClient = pool) {
    const { keyword, isActive, limit = 10, offset = 0 } = filters;

    let baseQuery = `
      SELECT 
        shift_id AS "shiftId",
        shift_code AS "shiftCode",
        shift_name AS "shiftName",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        late_grace_minutes AS "lateGraceMinutes",
        early_leave_grace_minutes AS "earlyLeaveGraceMinutes",
        minimum_work_minutes AS "minimumWorkMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM public.work_shifts
    `;

    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.work_shifts
    `;

    const whereClauses = [];
    const queryParams = [];

    if (isActive !== undefined && isActive !== null && isActive !== 'all') {
      queryParams.push(Number(isActive));
      whereClauses.push(`is_active = $${queryParams.length}`);
    } else if (isActive === undefined) {
      whereClauses.push(`is_active = 1`);
    }

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClauses.push(`(
        LOWER(shift_code) LIKE LOWER($${queryParams.length}) OR
        LOWER(shift_name) LIKE LOWER($${queryParams.length})
      )`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }

    baseQuery += ` ORDER BY shift_id ASC`;

    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(baseQuery, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    return {
      items: itemsRes.rows,
      total: countRes.rows[0].total
    };
  }

  async create(data, dbClient = pool) {
    const {
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes = 0,
      earlyLeaveGraceMinutes = 0,
      minimumWorkMinutes = 0,
      isActive = 1
    } = data;

    const queryText = `
      INSERT INTO public.work_shifts (
        shift_code,
        shift_name,
        start_time,
        end_time,
        late_grace_minutes,
        early_leave_grace_minutes,
        minimum_work_minutes,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING 
        shift_id AS "shiftId",
        shift_code AS "shiftCode",
        shift_name AS "shiftName",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        late_grace_minutes AS "lateGraceMinutes",
        early_leave_grace_minutes AS "earlyLeaveGraceMinutes",
        minimum_work_minutes AS "minimumWorkMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const res = await dbClient.query(queryText, [
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes,
      earlyLeaveGraceMinutes,
      minimumWorkMinutes,
      isActive
    ]);

    return res.rows[0];
  }

  async update(id, data, dbClient = pool) {
    const {
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes,
      earlyLeaveGraceMinutes,
      minimumWorkMinutes,
      isActive
    } = data;

    const queryText = `
      UPDATE public.work_shifts
      SET 
        shift_code = $1,
        shift_name = $2,
        start_time = $3,
        end_time = $4,
        late_grace_minutes = $5,
        early_leave_grace_minutes = $6,
        minimum_work_minutes = $7,
        is_active = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE shift_id = $9
      RETURNING 
        shift_id AS "shiftId",
        shift_code AS "shiftCode",
        shift_name AS "shiftName",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        late_grace_minutes AS "lateGraceMinutes",
        early_leave_grace_minutes AS "earlyLeaveGraceMinutes",
        minimum_work_minutes AS "minimumWorkMinutes",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const res = await dbClient.query(queryText, [
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes,
      earlyLeaveGraceMinutes,
      minimumWorkMinutes,
      isActive,
      id
    ]);

    return res.rows[0] || null;
  }

  async delete(id, dbClient = pool) {
    const queryText = `
      DELETE FROM public.work_shifts
      WHERE shift_id = $1
      RETURNING shift_id AS "shiftId";
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0] || null;
  }
}

module.exports = new ShiftRepository();
