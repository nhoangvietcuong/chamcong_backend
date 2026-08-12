const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const requestLogger = require('./middlewares/request-logger');
const healthRoutes = require('./routes/health-routes');
const authRoutes = require('./routes/auth-routes');
const departmentRoutes = require('./routes/department-routes');
const employeeRoutes = require('./routes/employee-routes');
const accountRoutes = require('./routes/account-routes');
const roleRoutes = require('./routes/role-routes');
const workLocationRoutes = require('./routes/work-location-routes');
const assignmentRoutes = require('./routes/assignment-routes');
const employeeAssignmentRoutes = require('./routes/employee-assignment-routes');
const shiftRoutes = require('./routes/shift-routes');
const attendanceRoutes = require('./routes/attendance-routes');
const reportRoutes = require('./routes/report-routes');
const dashboardRoutes = require('./routes/dashboard-routes');
const faceProfileAdminRoutes = require('./routes/face-profile-admin-routes');
const webauthnAdminRoutes = require('./routes/webauthn-admin-routes');
const deviceAdminRoutes = require('./routes/device-admin-routes');
const notificationRoutes = require('./routes/notification-routes');
const leaveRoutes = require('./routes/leave-routes');
const otRoutes = require('./routes/ot-routes');
require('./subscribers/leave-subscribers');
require('./subscribers/ot-subscribers');
const attendanceAnalyticsRoutes = require('./routes/attendance-analytics-routes');
const faceProfileRoutes = require('./modules/face-recognition/routes/face-profile-routes');
const livenessRoutes = require('./modules/liveness/routes/liveness-routes');
const deviceBiometricRoutes = require('./modules/device-biometric/routes/device-biometric-routes');
const globalErrorHandler = require('./middlewares/error-middleware');
const { NotFoundError } = require('./errors/app-error');

const authenticate = require('./middlewares/authenticate');

const app = express();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());

// Logging Middleware
app.use(requestLogger);

// Request Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images/files (Protected by JWT Authentication)
app.use('/uploads', authenticate, express.static(path.resolve(__dirname, '../uploads')));

app.get('/api/kill-sw', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Updating App...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body { display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f0f9ff; color:#0369a1; }</style>
      </head>
      <body>
        <div><h2>Đang cập nhật phiên bản mới...</h2><p>Vui lòng chờ trong giây lát.</p></div>
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
              var promises = registrations.map(function(r) { return r.unregister(); });
              Promise.all(promises).then(function() {
                setTimeout(function() { window.location.href = '/'; }, 1500);
              });
            });
          } else {
            setTimeout(function() { window.location.href = '/'; }, 1500);
          }
        </script>
      </body>
    </html>
  `);
});

// Routes — Public / Unauthenticated Endpoints First
app.use('/api', healthRoutes);
app.use('/api', authRoutes);

// Module Routes
app.use('/api/v1', faceProfileRoutes);
app.use('/api/v1', livenessRoutes);
app.use('/api/v1', deviceBiometricRoutes);
app.use('/api/v1', attendanceAnalyticsRoutes);

app.use('/api', notificationRoutes);

app.use('/api', faceProfileRoutes);
app.use('/api', livenessRoutes);
app.use('/api', deviceBiometricRoutes);

// Core System Routes
app.use('/api', departmentRoutes);
app.use('/api', employeeRoutes);
app.use('/api', accountRoutes);
app.use('/api', roleRoutes);
app.use('/api', workLocationRoutes);
app.use('/api', assignmentRoutes);
app.use('/api', employeeAssignmentRoutes);
app.use('/api', shiftRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', reportRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', faceProfileAdminRoutes);
app.use('/api', webauthnAdminRoutes);
app.use('/api', deviceAdminRoutes);
app.use('/api', leaveRoutes);
app.use('/api', otRoutes);


// [DEV ONLY] WebAuthn Test UI — served at http://localhost:3000/test/webauthn
// Needs relaxed CSP to allow Google Fonts & inline scripts
app.get('/test/webauthn', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src * 'self' http://localhost:3000; img-src 'self' data:;"
  );
  res.sendFile(path.resolve(__dirname, './modules/device-biometric/tests/webauthn-test-ui.html'));
});

// Fallback Route for non-existent endpoints
app.use('*', (req, res, next) => {
  next(new NotFoundError(`Không tìm thấy endpoint ${req.originalUrl}`));
});

// Centralized Global Error Handler
app.use(globalErrorHandler);

module.exports = app;
