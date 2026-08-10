const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const combinedLogPath = path.join(logsDir, 'combined.log');
const errorLogPath = path.join(logsDir, 'error.log');

const writeLog = (level, message, meta = '') => {
  const timestamp = new Date().toISOString();
  let metaString = '';
  
  if (meta) {
    if (meta instanceof Error) {
      metaString = `\nStack trace: ${meta.stack}`;
    } else {
      metaString = ` | Meta: ${JSON.stringify(meta)}`;
    }
  }
  
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}\n`;

  // Print to console with ANSI colors
  if (level === 'error') {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`, meta || '');
  } else if (level === 'warn') {
    console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`, meta || '');
  } else {
    console.log(`\x1b[36m[INFO]\x1b[0m ${message}`, meta || '');
  }

  // Write to combined log
  fs.appendFile(combinedLogPath, logLine, (err) => {
    if (err) console.error('Failed to write to combined.log:', err);
  });

  // Write warnings and errors to error log
  if (level === 'error' || level === 'warn') {
    fs.appendFile(errorLogPath, logLine, (err) => {
      if (err) console.error('Failed to write to error.log:', err);
    });
  }
};

const logger = {
  info: (msg, meta) => writeLog('info', msg, meta),
  warn: (msg, meta) => writeLog('warn', msg, meta),
  error: (msg, meta) => writeLog('error', msg, meta),
};

module.exports = logger;
