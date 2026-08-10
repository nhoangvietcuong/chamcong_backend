const { pool } = require('../config/db');

class AssignmentRepository {
  async findAndCount(filters, dbClient = pool) {
    const {
      keyword,
      employeeId,
      departmentId,
      locationId,
      workDate,
      fromDate,
      toDate,
      status,
      sortBy,
      sortOrder,
      limit,
      offset
    } = filters;

    let baseQuery = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.note,
        ewa.status,
        ewa.created_at,
        e.employee_id,
        e.employee_code,
        e.full_name,
        d.department_id,
        d.department_name,
        wl.location_id,
        wl.location_name,
        wl.address,
        wl.latitude,
        wl.longitude,
        wl.allowed_radius_meter,
        wl.is_company_location,
        ws.shift_id,
        ws.shift_code,
        ws.shift_name,
        ws.start_time,
        ws.end_time,
        ws.late_grace_minutes,
        ws.early_leave_grace_minutes,
        ws.minimum_work_minutes,
        ws.is_active as shift_is_active,
        a.account_id,
        a.username,
        EXISTS (
          SELECT 1 FROM public.attendance att 
          WHERE att.assignment_id = ewa.assignment_id
        ) as has_attendance
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      LEFT JOIN public.accounts a ON ewa.created_by = a.account_id
    `;

    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      LEFT JOIN public.accounts a ON ewa.created_by = a.account_id
    `;

    const whereClauses = [];
    const queryParams = [];

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClauses.push(`(
        LOWER(e.employee_code) LIKE LOWER($${queryParams.length}) OR
        LOWER(e.full_name) LIKE LOWER($${queryParams.length}) OR
        LOWER(wl.location_name) LIKE LOWER($${queryParams.length}) OR
        LOWER(wl.address) LIKE LOWER($${queryParams.length})
      )`);
    }

    if (employeeId !== undefined && employeeId !== null && employeeId !== '') {
      queryParams.push(parseInt(employeeId, 10));
      whereClauses.push(`ewa.employee_id = $${queryParams.length}`);
    }

    if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
      queryParams.push(parseInt(departmentId, 10));
      whereClauses.push(`e.department_id = $${queryParams.length}`);
    }

    if (locationId !== undefined && locationId !== null && locationId !== '') {
      queryParams.push(parseInt(locationId, 10));
      whereClauses.push(`ewa.location_id = $${queryParams.length}`);
    }

    if (workDate) {
      queryParams.push(workDate);
      whereClauses.push(`ewa.work_date = $${queryParams.length}`);
    }

    if (fromDate) {
      queryParams.push(fromDate);
      whereClauses.push(`ewa.work_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      whereClauses.push(`ewa.work_date <= $${queryParams.length}`);
    }

    if (status) {
      queryParams.push(status);
      whereClauses.push(`ewa.status = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }

    const allowedSortBy = {
      assignmentId: 'ewa.assignment_id',
      workDate: 'ewa.work_date',
      status: 'ewa.status',
      createdAt: 'ewa.created_at'
    };

    const dbSortBy = allowedSortBy[sortBy] || 'ewa.assignment_id';
    const dbSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    baseQuery += ` ORDER BY ${dbSortBy} ${dbSortOrder}`;

    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(baseQuery, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    const items = await Promise.all(itemsRes.rows.map(async row => {
      const assignment = this._mapRow(row);
      assignment.allowedLocations = await this.findLocationsByAssignmentId(row.assignment_id, dbClient);
      return assignment;
    }));

    return {
      items,
      total: countRes.rows[0].total
    };
  }

  async findCalendar(filters, dbClient = pool) {
    const {
      year,
      month,
      employeeId,
      departmentId,
      locationId
    } = filters;

    // Calculate start & end of the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let baseQuery = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.status,
        e.full_name as employee_name,
        wl.location_name
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      WHERE ewa.work_date >= $1 AND ewa.work_date <= $2 AND ewa.status != 'CANCELLED'
    `;

    const queryParams = [startDate, endDate];
    const whereClauses = [];

    if (employeeId !== undefined && employeeId !== null && employeeId !== '') {
      queryParams.push(parseInt(employeeId, 10));
      whereClauses.push(`ewa.employee_id = $${queryParams.length}`);
    }

    if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
      queryParams.push(parseInt(departmentId, 10));
      whereClauses.push(`e.department_id = $${queryParams.length}`);
    }

    if (locationId !== undefined && locationId !== null && locationId !== '') {
      queryParams.push(parseInt(locationId, 10));
      whereClauses.push(`ewa.location_id = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      baseQuery += ' AND ' + whereClauses.join(' AND ');
    }

    baseQuery += ` ORDER BY ewa.work_date ASC, ewa.assignment_id ASC`;

    const res = await dbClient.query(baseQuery, queryParams);
    return res.rows.map(row => ({
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: this._formatDate(row.work_date),
      employeeName: row.employee_name,
      locationName: row.location_name,
      status: row.status
    }));
  }

  async findLocationsByAssignmentId(assignmentId, dbClient = pool) {
    const query = `
      SELECT wl.* 
      FROM public.assignment_locations al
      JOIN public.work_locations wl ON al.location_id = wl.location_id
      WHERE al.assignment_id = $1
    `;
    const res = await dbClient.query(query, [assignmentId]);
    return res.rows.map(row => ({
      locationId: parseInt(row.location_id, 10),
      locationName: row.location_name,
      address: row.address,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
      isCompanyLocation: !!row.is_company_location,
      status: parseInt(row.status || 1, 10)
    }));
  }

  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.note,
        ewa.status,
        ewa.created_at,
        e.employee_id,
        e.employee_code,
        e.full_name,
        d.department_id,
        d.department_name,
        wl.location_id,
        wl.location_name,
        wl.address,
        wl.latitude,
        wl.longitude,
        wl.allowed_radius_meter,
        wl.is_company_location,
        ws.shift_id,
        ws.shift_code,
        ws.shift_name,
        ws.start_time,
        ws.end_time,
        ws.late_grace_minutes,
        ws.early_leave_grace_minutes,
        ws.minimum_work_minutes,
        ws.is_active as shift_is_active,
        a.account_id,
        a.username,
        EXISTS (
          SELECT 1 FROM public.attendance att 
          WHERE att.assignment_id = ewa.assignment_id
        ) as has_attendance
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      LEFT JOIN public.accounts a ON ewa.created_by = a.account_id
      WHERE ewa.assignment_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    if (!res.rows[0]) return null;
    const assignment = this._mapRow(res.rows[0]);
    assignment.allowedLocations = await this.findLocationsByAssignmentId(id, dbClient);
    return assignment;
  }

  async findByEmployeeAndDate(employeeId, workDate, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.employee_work_assignments
      WHERE employee_id = $1 AND work_date = $2
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate]);
    return res.rows[0];
  }

  async create(data, dbClient = pool) {
    const { employeeId, locationId, locationIds, shiftId, workDate, note, status, createdBy } = data;
    const primaryLocId = locationId || (locationIds && locationIds[0]);
    const queryText = `
      INSERT INTO public.employee_work_assignments (
        employee_id,
        location_id,
        shift_id,
        work_date,
        note,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      employeeId,
      primaryLocId,
      shiftId,
      workDate,
      note,
      status,
      createdBy
    ]);
    const assignment = res.rows[0];

    const finalLocIds = locationIds || (locationId ? [locationId] : []);
    if (finalLocIds.length > 0) {
      for (const locId of finalLocIds) {
        await dbClient.query(`
          INSERT INTO public.assignment_locations (assignment_id, location_id)
          VALUES ($1, $2)
          ON CONFLICT (assignment_id, location_id) DO NOTHING;
        `, [assignment.assignment_id, locId]);
      }
    }
    return assignment;
  }

  async update(id, data, dbClient = pool) {
    const { employeeId, locationId, locationIds, shiftId, workDate, note } = data;
    const primaryLocId = locationId || (locationIds && locationIds[0]);
    const queryText = `
      UPDATE public.employee_work_assignments
      SET 
        employee_id = $1,
        location_id = $2,
        shift_id = $3,
        work_date = $4,
        note = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE assignment_id = $6
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      employeeId,
      primaryLocId,
      shiftId,
      workDate,
      note,
      id
    ]);
    const assignment = res.rows[0];

    await dbClient.query(`DELETE FROM public.assignment_locations WHERE assignment_id = $1`, [id]);
    const finalLocIds = locationIds || (locationId ? [locationId] : []);
    if (finalLocIds.length > 0) {
      for (const locId of finalLocIds) {
        await dbClient.query(`
          INSERT INTO public.assignment_locations (assignment_id, location_id)
          VALUES ($1, $2)
          ON CONFLICT (assignment_id, location_id) DO NOTHING;
        `, [id, locId]);
      }
    }
    return assignment;
  }

  async updateStatus(id, status, note = null, dbClient = pool) {
    let queryText;
    let params;
    
    if (note !== null) {
      queryText = `
        UPDATE public.employee_work_assignments
        SET status = $1, note = $2, updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = $3
        RETURNING *;
      `;
      params = [status, note, id];
    } else {
      queryText = `
        UPDATE public.employee_work_assignments
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = $2
        RETURNING *;
      `;
      params = [status, id];
    }

    const res = await dbClient.query(queryText, params);
    return res.rows[0];
  }

  async findTodayAssignment(employeeId, dateStr, dbClient = pool) {
    const queryText = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.status,
        ewa.note,
        wl.location_id,
        wl.location_name,
        wl.address,
        wl.latitude,
        wl.longitude,
        wl.allowed_radius_meter,
        ws.shift_id,
        ws.shift_code,
        ws.shift_name,
        ws.start_time,
        ws.end_time,
        ws.late_grace_minutes,
        ws.early_leave_grace_minutes,
        ws.minimum_work_minutes,
        ws.is_active AS shift_is_active
      FROM public.employee_work_assignments ewa
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      WHERE ewa.employee_id = $1 
        AND ewa.work_date = $2 
        AND ewa.status IN ('ASSIGNED', 'COMPLETED')
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, dateStr]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    const assignment = {
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: this._formatDate(row.work_date),
      status: row.status,
      note: row.note,
      location: {
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        address: row.address,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10)
      },
      shift: {
        shiftId: parseInt(row.shift_id, 10),
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        startTime: row.start_time,
        endTime: row.end_time,
        lateGraceMinutes: parseInt(row.late_grace_minutes, 10),
        earlyLeaveGraceMinutes: parseInt(row.early_leave_grace_minutes, 10),
        minimumWorkMinutes: parseInt(row.minimum_work_minutes, 10),
        isActive: parseInt(row.shift_is_active, 10)
      }
    };
    assignment.allowedLocations = await this.findLocationsByAssignmentId(assignment.assignmentId, dbClient);
    return assignment;
  }

  async findHistory(employeeId, filters, dbClient = pool) {
    const { fromDate, toDate, status, limit, offset } = filters;

    let baseQuery = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.status,
        ewa.note,
        wl.location_id,
        wl.location_name,
        wl.address,
        wl.latitude,
        wl.longitude,
        wl.allowed_radius_meter
      FROM public.employee_work_assignments ewa
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      WHERE ewa.employee_id = $1
    `;

    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.employee_work_assignments ewa
      WHERE ewa.employee_id = $1
    `;

    const queryParams = [employeeId];
    const whereClauses = [];

    if (fromDate) {
      queryParams.push(fromDate);
      whereClauses.push(`ewa.work_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      whereClauses.push(`ewa.work_date <= $${queryParams.length}`);
    }

    if (status) {
      queryParams.push(status);
      whereClauses.push(`ewa.status = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' AND ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }

    baseQuery += ` ORDER BY ewa.work_date DESC, ewa.assignment_id DESC`;

    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(baseQuery, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    const items = itemsRes.rows.map(row => ({
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: this._formatDate(row.work_date),
      status: row.status,
      note: row.note,
      location: {
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        address: row.address,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10)
      }
    }));

    return {
      items,
      total: countRes.rows[0].total
    };
  }

  async findUncompletedOvernightAssignment(employeeId, todayStr, dbClient = pool) {
    const queryText = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.status,
        ewa.note,
        wl.location_id,
        wl.location_name,
        wl.address,
        wl.latitude,
        wl.longitude,
        wl.allowed_radius_meter,
        ws.shift_id,
        ws.shift_code,
        ws.shift_name,
        ws.start_time,
        ws.end_time,
        ws.late_grace_minutes,
        ws.early_leave_grace_minutes,
        ws.minimum_work_minutes,
        ws.is_active AS shift_is_active
      FROM public.employee_work_assignments ewa
      JOIN public.work_locations wl ON ewa.location_id = wl.location_id
      JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      JOIN public.attendance att ON att.assignment_id = ewa.assignment_id
      WHERE ewa.employee_id = $1 
        AND ewa.work_date = ($2::date - INTERVAL '1 day')::date
        AND ws.end_time < ws.start_time
        AND att.attendance_status IN ('IN_PROGRESS', 'REVIEW_REQUIRED')
        AND att.check_out_time IS NULL
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, todayStr]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: this._formatDate(row.work_date),
      status: row.status,
      note: row.note,
      location: {
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        address: row.address,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10)
      },
      shift: {
        shiftId: parseInt(row.shift_id, 10),
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        startTime: row.start_time,
        endTime: row.end_time,
        lateGraceMinutes: parseInt(row.late_grace_minutes, 10),
        earlyLeaveGraceMinutes: parseInt(row.early_leave_grace_minutes, 10),
        minimumWorkMinutes: parseInt(row.minimum_work_minutes, 10),
        isActive: parseInt(row.shift_is_active !== undefined ? row.shift_is_active : row.is_active, 10)
      }
    };
  }

  _formatDate(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') return dateVal.substring(0, 10);
    const d = new Date(dateVal);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _mapRow(row) {
    return {
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: this._formatDate(row.work_date),
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
      hasAttendance: row.has_attendance,
      employee: {
        employeeId: parseInt(row.employee_id, 10),
        employeeCode: row.employee_code,
        fullName: row.full_name,
        departmentId: parseInt(row.department_id, 10),
        departmentName: row.department_name
      },
      location: {
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        address: row.address,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
        isCompanyLocation: !!row.is_company_location
      },
      shift: row.shift_id ? {
        shiftId: parseInt(row.shift_id, 10),
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        startTime: row.start_time,
        endTime: row.end_time,
        lateGraceMinutes: parseInt(row.late_grace_minutes, 10),
        earlyLeaveGraceMinutes: parseInt(row.early_leave_grace_minutes, 10),
        minimumWorkMinutes: parseInt(row.minimum_work_minutes, 10),
        isActive: parseInt(row.shift_is_active !== undefined ? row.shift_is_active : row.is_active, 10)
      } : null,
      createdBy: row.account_id ? {
        accountId: parseInt(row.account_id, 10),
        username: row.username
      } : null
    };
  }
}

module.exports = new AssignmentRepository();
