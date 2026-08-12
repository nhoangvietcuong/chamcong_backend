const { pool } = require('../config/db');

class WorkLocationRepository {
  async findAndCount(filters, dbClient = pool) {
    const { keyword, status, sortBy, sortOrder, limit, offset } = filters;

    let queryText = 'SELECT * FROM public.work_locations';
    let countQueryText = 'SELECT COUNT(*)::int as total FROM public.work_locations';

    const whereClauses = [];
    const queryParams = [];

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClauses.push(`(LOWER(location_name) LIKE LOWER($${queryParams.length}) OR LOWER(address) LIKE LOWER($${queryParams.length}))`);
    }

    if (status !== undefined && status !== null && status !== '') {
      queryParams.push(parseInt(status, 10));
      whereClauses.push(`status = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      queryText += whereString;
      countQueryText += whereString;
    }

    // Sort whitelist
    const allowedSortBy = {
      locationId: 'location_id',
      location_id: 'location_id',
      locationName: 'location_name',
      address: 'address',
      latitude: 'latitude',
      longitude: 'longitude',
      allowedRadiusMeter: 'allowed_radius_meter',
      status: 'status',
      createdAt: 'created_at'
    };
    
    const dbSortBy = allowedSortBy[sortBy] || 'location_id';
    const dbSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    queryText += ` ORDER BY ${dbSortBy} ${dbSortOrder}`;

    queryParams.push(limit);
    queryText += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    queryText += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(queryText, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQueryText, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    const items = itemsRes.rows.map(row => this._mapRow(row));

    return {
      items,
      total: countRes.rows[0].total
    };
  }

  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.work_locations
      WHERE location_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    if (!res.rows[0]) return null;
    return this._mapRow(res.rows[0]);
  }

  async findByName(locationName, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.work_locations
      WHERE LOWER(location_name) = LOWER($1)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [locationName]);
    if (!res.rows[0]) return null;
    return this._mapRow(res.rows[0]);
  }

  async create(data, dbClient = pool) {
    const { locationName, address, latitude, longitude, allowedRadiusMeter, isCompanyLocation = false } = data;
    const queryText = `
      INSERT INTO public.work_locations (
        location_name,
        address,
        latitude,
        longitude,
        allowed_radius_meter,
        is_company_location,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 1)
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      locationName,
      address,
      latitude,
      longitude,
      allowedRadiusMeter,
      isCompanyLocation
    ]);
    return this._mapRow(res.rows[0]);
  }

  async update(id, data, dbClient = pool) {
    const { locationName, address, latitude, longitude, allowedRadiusMeter, isCompanyLocation } = data;
    const queryText = `
      UPDATE public.work_locations
      SET 
        location_name = $1,
        address = $2,
        latitude = $3,
        longitude = $4,
        allowed_radius_meter = $5,
        is_company_location = COALESCE($6, is_company_location),
        updated_at = CURRENT_TIMESTAMP
      WHERE location_id = $7
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [
      locationName,
      address,
      latitude,
      longitude,
      allowedRadiusMeter,
      isCompanyLocation,
      id
    ]);
    return this._mapRow(res.rows[0]);
  }

  async updateStatus(id, status, dbClient = pool) {
    const queryText = `
      UPDATE public.work_locations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE location_id = $2
      RETURNING *;
    `;
    const res = await dbClient.query(queryText, [status, id]);
    return this._mapRow(res.rows[0]);
  }

  async countAssignments(id, dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int as count
      FROM public.employee_work_assignments
      WHERE location_id = $1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0].count;
  }

  async countFutureAssignments(id, dateStr, dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int as count
      FROM public.employee_work_assignments
      WHERE location_id = $1 AND work_date > $2 AND status = 'ASSIGNED';
    `;
    const res = await dbClient.query(queryText, [id, dateStr]);
    return res.rows[0].count;
  }

  async findCompanyLocations(dbClient = pool) {
    const queryText = `
      SELECT * FROM public.work_locations
      WHERE is_company_location = true AND status = 1;
    `;
    const res = await dbClient.query(queryText);
    return res.rows.map(row => this._mapRow(row));
  }

  async bulkDelete(ids, dbClient = pool) {
    const queryText = `
      DELETE FROM public.work_locations
      WHERE location_id = ANY($1::int[])
    `;
    const res = await dbClient.query(queryText, [ids]);
    return res.rowCount;
  }

  _mapRow(row) {
    if (!row) return null;
    return {
      locationId: parseInt(row.location_id, 10),
      locationName: row.location_name,
      address: row.address,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
      isCompanyLocation: !!row.is_company_location,
      status: parseInt(row.status, 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = new WorkLocationRepository();
