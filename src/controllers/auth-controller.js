const authService = require('../services/auth-service');

class AuthController {
  async login(req, res, next) {
    try {
      const crypto = require('crypto');
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      let deviceFingerprint = req.headers['x-device-fingerprint'];
      if (!deviceFingerprint) {
        const userAgent = req.headers['user-agent'] || '';
        deviceFingerprint = crypto.createHash('sha256').update(userAgent).digest('hex');
      }

      const loginData = {
        ...req.body,
        deviceFingerprint,
      };

      const result = await authService.login(loginData, ipAddress);
      
      res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          ...result,
          deviceFingerprint,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const result = await authService.refreshToken(req.body);
      
      res.status(200).json({
        success: true,
        message: 'Làm mới token thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      await authService.logout(req.auth, ipAddress);
      
      res.status(200).json({
        success: true,
        message: 'Đăng xuất thành công',
        data: {},
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req, res, next) {
    try {
      const user = await authService.getCurrentUser(req.auth.accountId);
      
      res.status(200).json({
        success: true,
        message: 'Lấy thông tin người dùng thành công',
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async adminOnly(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        message: 'Truy cập route ADMIN thành công',
        data: {
          role: req.auth.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async requestForgotPasswordOtp(req, res, next) {
    try {
      const otpService = require('../services/otp-service');
      const { identifier, channel } = req.body;
      const result = await otpService.requestPasswordResetOtp(identifier, channel);
      if (result && result.success === false) {
        return res.status(400).json(result);
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async verifyForgotPasswordOtp(req, res, next) {
    try {
      const otpService = require('../services/otp-service');
      const { identifier, otpCode } = req.body;
      const result = await otpService.verifyPasswordResetOtp(identifier, otpCode);
      if (result && result.success === false) {
        return res.status(400).json(result);
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const otpService = require('../services/otp-service');
      const { resetToken, newPassword } = req.body;
      const result = await otpService.resetPasswordWithToken(resetToken, newPassword);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res, next) {
    try {
      const otpService = require('../services/otp-service');
      const { currentPassword, newPassword } = req.body;
      const accountId = req.auth.accountId;
      const result = await otpService.changeSelfPassword(accountId, currentPassword, newPassword);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
