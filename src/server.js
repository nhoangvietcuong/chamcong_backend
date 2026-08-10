const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const app = require('./app');
const { pool } = require('./config/db');
const { initializeAIEngine } = require('./modules/face-recognition/ai-engine/startup-loader');
const shiftReminderScheduler = require('./services/shift-reminder.scheduler');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  // Preload and initialize the AI Engine sequence
  initializeAIEngine().catch((err) => {
    console.warn(`⚠️  AI Engine failed to initialize: ${err.message}`);
  });

  // Start the Shift Reminder Scheduler
  shiftReminderScheduler.start();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
  console.error(err.name, err.message, err.stack);
  server.close(() => {
    pool.end(() => {
      console.log('Database pool closed. Process terminated.');
      process.exit(1);
    });
  });
});

// Graceful shutdown on termination signals
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    require('./modules/face-recognition/services/mediapipe.service').dispose();
    require('./modules/face-recognition/services/tensorflow.service').dispose();
    console.log('AI Models & WASM memory cleaned up.');
  } catch (_) {}

  server.close(() => {
    console.log('HTTP server closed.');
    pool.end(() => {
      console.log('Database pool closed. Process terminated.');
      process.exit(0);
    });
  });

  // Force shutdown after 1.5 seconds if graceful close fails/hangs
  setTimeout(() => {
    console.error('Forcefully shutting down because graceful close timed out.');
    process.exit(1);
  }, 1500).unref();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));


