process.env.NODE_ENV = 'test';
process.env.PGDATABASE = 'attendance_test';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configure main template connection to verify/create database
const adminPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: 'postgres',
});

async function runSqlFile(client, filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  content = content.split('\n').map(line => {
    const commentIdx = line.indexOf('--');
    if (commentIdx !== -1) {
      return line.substring(0, commentIdx);
    }
    return line;
  }).join('\n');

  let currentStmt = '';
  let inDollarBlock = false;
  let inQuote = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '$' && nextChar === '$') {
      inDollarBlock = !inDollarBlock;
      currentStmt += '$$';
      i++;
      continue;
    }
    
    if (char === "'" && !inDollarBlock) {
      if (nextChar === "'") {
        currentStmt += "''";
        i++;
        continue;
      }
      inQuote = !inQuote;
    }
    
    if (char === ';' && !inDollarBlock && !inQuote) {
      const stmt = currentStmt.trim();
      if (stmt && stmt.toLowerCase() !== 'begin' && stmt.toLowerCase() !== 'commit') {
        await client.query(stmt);
      }
      currentStmt = '';
    } else {
      currentStmt += char;
    }
  }
  const stmt = currentStmt.trim();
  if (stmt && stmt.toLowerCase() !== 'begin' && stmt.toLowerCase() !== 'commit') {
    await client.query(stmt);
  }
}

const setupTestDatabase = async () => {
  console.log('Initializing test database "attendance_test"...');
  
  // 1. Create PGDATABASE if not exists
  const checkDb = await adminPool.query(
    "SELECT 1 FROM pg_database WHERE datname = 'attendance_test'"
  );
  if (checkDb.rows.length === 0) {
    await adminPool.query("CREATE DATABASE attendance_test");
    console.log('Database "attendance_test" created.');
  }

  // 2. Connect to attendance_test database
  const testPool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: 'attendance_test',
  });

  const client = await testPool.connect();
  try {
    // 3. Drop all schemas and tables in public schema to clean start
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    
    // 4. Run Cham_Cong_Main_Database_Khong_Phan_Ca_Final.sql
    console.log('Running main schema file...');
    await runSqlFile(client, path.resolve(__dirname, '../../Cham_Cong_Main_Database_Khong_Phan_Ca_Final.sql'));

    // 5. Run migrations in database/migrations/
    console.log('Running migration files...');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir).sort();
      for (const file of migrationFiles) {
        if (file.endsWith('.sql')) {
          console.log(`Running migration: ${file}`);
          await runSqlFile(client, path.join(migrationsDir, file));
        }
      }
    }

    // 6. Ensure indexes and dynamic columns from db.js exist synchronously
    console.log('Ensuring dynamic columns and indexes...');
    await client.query(`
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
      ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_verification_photo_url TEXT;
      ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_verification_photo_url TEXT;
    `);
    
    console.log('Test database "attendance_test" setup completed successfully.');
  } finally {
    client.release();
    await testPool.end();
  }
};

const cleanAllTables = async (dbClient) => {
  const tables = [
    'public.system_logs',
    'public.employee_face_profiles',
    'public.employee_webauthn_credentials',
    'public.attendance_location_logs',
    'public.attendance',
    'public.employee_work_assignments',
    'public.work_locations',
    'public.registered_devices',
    'public.user_sessions',
    'public.accounts',
    'public.employees',
    'public.departments',
    'public.work_shifts'
  ];
  for (const table of tables) {
    try {
      await dbClient.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (e) {
      // Table might not exist or be truncated
    }
  }
};

module.exports = {
  adminPool,
  setupTestDatabase,
  cleanAllTables,
};
