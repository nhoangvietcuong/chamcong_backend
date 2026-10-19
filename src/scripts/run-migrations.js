const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

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
        try {
          await client.query(stmt);
        } catch (err) {
          // If already exists or harmless duplicate error, continue
          if (!err.message.includes('already exists') && !err.message.includes('duplicate key')) {
            throw err;
          }
        }
      }
      currentStmt = '';
    } else {
      currentStmt += char;
    }
  }

  const stmt = currentStmt.trim();
  if (stmt && stmt.toLowerCase() !== 'begin' && stmt.toLowerCase() !== 'commit') {
    try {
      await client.query(stmt);
    } catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate key')) {
        throw err;
      }
    }
  }
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('====================================================');
    console.log('   BẮT ĐẦU CHẠY DATABASE MIGRATIONS');
    console.log('====================================================\n');

    const migrationsDir = path.resolve(__dirname, '../../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('Thư mục database/migrations không tồn tại.');
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    console.log(`Tìm thấy ${files.length} file migration.\n`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      process.stdout.write(`⏳ Đang chạy: ${file}... `);
      await runSqlFile(client, filePath);
      console.log('✓ Thành công');
    }

    console.log('\n====================================================');
    console.log('   TẤT CẢ MIGRATIONS ĐÃ CHẠY THÀNH CÔNG!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Lỗi khi chạy migration:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch(() => process.exit(1));
}

module.exports = { runMigrations };
