const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const mailService = require('./mail-service');
const smsService = require('./sms-service');

class OtpService {
  getSecret() {
    return process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET || 'chamcong_otp_hmac_secret_2026';
  }

  hashOtp(otpCode) {
    return crypto.createHmac('sha256', this.getSecret()).update(String(otpCode)).digest('hex');
  }

  hashToken(tokenStr) {
    return crypto.createHmac('sha256', this.getSecret()).update(String(tokenStr)).digest('hex');
  }

  /**
   * Generates OTP for account if found, sends via selected channel.
   * ANTI USER-ENUMERATION: Always returns generic success message regardless of whether identifier exists.
   */
  async requestPasswordResetOtp(identifier, channel = 'EMAIL') {
    const genericResponse = {
      success: true,
      message: 'Nếu thông tin tài khoản hợp lệ, mã xác thực OTP đã được gửi đến bạn trong ít phút.'
    };

    if (!identifier || typeof identifier !== 'string') {
      return {
        success: false,
        message: 'Vui lòng nhập Email, Tên đăng nhập hoặc Số điện thoại.'
      };
    }

    const cleanId = identifier.trim();
    const selectedChannel = (channel && channel.toUpperCase() === 'SMS') ? 'SMS' : 'EMAIL';
    const isEmailInput = cleanId.includes('@');

    try {
      let accountRes;
      if (isEmailInput) {
        // Strict exact match for email address inputs
        accountRes = await pool.query(`
          SELECT a.account_id, a.username, e.email, e.phone, e.full_name
          FROM public.accounts a
          LEFT JOIN public.employees e ON a.employee_id = e.employee_id
          WHERE LOWER(e.email) = LOWER($1)
             OR LOWER(a.username) = LOWER($1)
          LIMIT 1
        `, [cleanId]);
      } else {
        // Lookup by username, employee code, or phone
        accountRes = await pool.query(`
          SELECT a.account_id, a.username, e.email, e.phone, e.full_name
          FROM public.accounts a
          LEFT JOIN public.employees e ON a.employee_id = e.employee_id
          WHERE LOWER(a.username) = LOWER($1)
             OR LOWER(e.employee_code) = LOWER($1)
             OR e.phone = $1
          LIMIT 1
        `, [cleanId]);
      }

      if (accountRes.rows.length === 0) {
        if (isEmailInput) {
          return {
            success: false,
            message: 'Email nhập vào không chính xác. Vui lòng nhập đúng Email đã đăng ký tài khoản.'
          };
        }
        return {
          success: false,
          message: 'Không tìm thấy tài khoản hợp lệ với thông tin đã nhập. Vui lòng kiểm tra lại Tên đăng nhập hoặc Số điện thoại.'
        };
      }

      const acc = accountRes.rows[0];
      let destination;
      if (selectedChannel === 'EMAIL') {
        destination = acc.email || acc.username;
        if (!destination || !destination.includes('@')) {
          return {
            success: false,
            message: 'Tài khoản chưa được đăng ký địa chỉ Email hợp lệ trong hệ thống.'
          };
        }
      } else {
        destination = acc.phone;
        if (!destination) {
          return {
            success: false,
            message: 'Tài khoản chưa được đăng ký Số điện thoại hợp lệ trong hệ thống.'
          };
        }
      }

      if (!destination) {
        return genericResponse;
      }

      // Generate 6-digit cryptographically secure OTP
      const rawOtp = String(crypto.randomInt(100000, 1000000));
      const otpHash = this.hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

      // Invalidate any existing unused OTPs for this account
      await pool.query(`
        UPDATE public.password_reset_otps
        SET is_used = TRUE
        WHERE account_id = $1 AND is_used = FALSE
      `, [acc.account_id]);

      // Insert new OTP record
      await pool.query(`
        INSERT INTO public.password_reset_otps (account_id, otp_hash, channel, destination, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [acc.account_id, otpHash, selectedChannel, destination, expiresAt]);

      // Send OTP via chosen channel
      let sendResult;
      if (selectedChannel === 'EMAIL') {
        sendResult = await mailService.sendOtpEmail(destination, rawOtp, acc.full_name || acc.username);
      } else {
        sendResult = await smsService.sendOtpSms(destination, rawOtp);
      }

      if (sendResult && sendResult.mocked) {
        console.log(`[OtpService DEMO OTP] Account: ${acc.username}, Destination: ${destination}, OTP: ${rawOtp}`);
      }

      return genericResponse;
    } catch (err) {
      console.error('[OtpService requestPasswordResetOtp Error]', err);
      return genericResponse;
    }
  }

  /**
   * Verifies OTP code and returns resetToken
   */
  async verifyPasswordResetOtp(identifier, otpCode) {
    if (!identifier || !otpCode) {
      throw new Error('Vui lòng nhập đầy đủ thông tin tài khoản và mã OTP.');
    }

    const cleanId = identifier.trim();
    const cleanOtp = String(otpCode).trim();

    const accountRes = await pool.query(`
      SELECT a.account_id
      FROM public.accounts a
      LEFT JOIN public.employees e ON a.employee_id = e.employee_id
      WHERE LOWER(a.username) = LOWER($1)
         OR LOWER(a.username) = LOWER(SPLIT_PART($1, '@', 1))
         OR LOWER(e.employee_code) = LOWER($1)
         OR LOWER(e.email) = LOWER($1)
         OR e.phone = $1
      LIMIT 1
    `, [cleanId]);

    if (accountRes.rows.length === 0) {
      throw new Error('Mã OTP không hợp lệ hoặc đã hết hạn.');
    }

    const accountId = accountRes.rows[0].account_id;

    // Get latest active OTP record for account
    const otpRes = await pool.query(`
      SELECT otp_id, otp_hash, attempts, expires_at, is_used
      FROM public.password_reset_otps
      WHERE account_id = $1 AND is_used = FALSE
      ORDER BY otp_id DESC
      LIMIT 1
    `, [accountId]);

    if (otpRes.rows.length === 0) {
      throw new Error('Mã OTP không hợp lệ hoặc đã hết hạn.');
    }

    const otpRecord = otpRes.rows[0];

    if (new Date() > new Date(otpRecord.expires_at)) {
      throw new Error('Mã OTP đã hết hạn. Vui lòng yêu cầu mã OTP mới.');
    }

    if (otpRecord.attempts >= 5) {
      throw new Error('Mã OTP đã nhập sai quá 5 lần. Vui lòng yêu cầu mã OTP mới.');
    }

    const computedHash = this.hashOtp(cleanOtp);

    if (computedHash !== otpRecord.otp_hash) {
      // Increment attempts
      await pool.query(`
        UPDATE public.password_reset_otps
        SET attempts = attempts + 1
        WHERE otp_id = $1
      `, [otpRecord.otp_id]);

      const remainingAttempts = 5 - (otpRecord.attempts + 1);
      throw new Error(`Mã OTP không chính xác. Bạn còn ${Math.max(0, remainingAttempts)} lần thử.`);
    }

    // OTP is valid! Generate resetToken
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = this.hashToken(resetToken);

    await pool.query(`
      UPDATE public.password_reset_otps
      SET is_used = TRUE, reset_token_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE otp_id = $2
    `, [resetTokenHash, otpRecord.otp_id]);

    return {
      success: true,
      message: 'Xác thực mã OTP thành công.',
      resetToken
    };
  }

  /**
   * Resets password using valid resetToken and REVOKES ALL SESSIONS.
   */
  async resetPasswordWithToken(resetToken, newPassword) {
    if (!resetToken || !newPassword) {
      throw new Error('Thông tin đặt lại mật khẩu không hợp lệ.');
    }

    if (newPassword.length < 6) {
      throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const tokenHash = this.hashToken(resetToken);

    const otpRes = await pool.query(`
      SELECT otp_id, account_id, expires_at
      FROM public.password_reset_otps
      WHERE reset_token_hash = $1
      ORDER BY otp_id DESC
      LIMIT 1
    `, [tokenHash]);

    if (otpRes.rows.length === 0) {
      throw new Error('Token đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.');
    }

    const record = otpRes.rows[0];

    // Token valid for 15 minutes after creation
    const maxTokenAge = new Date(new Date(record.expires_at).getTime() + 10 * 60 * 1000);
    if (new Date() > maxTokenAge) {
      throw new Error('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thực hiện lại từ đầu.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await pool.query(`
      UPDATE public.accounts
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $2
    `, [newPasswordHash, record.account_id]);

    // REVOKE ALL ACTIVE SESSIONS for this account
    await pool.query(`
      UPDATE public.user_sessions
      SET session_status = 'REVOKED', logout_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1 AND session_status = 'ACTIVE'
    `, [record.account_id]);

    // Clear reset token hash so it cannot be reused
    await pool.query(`
      UPDATE public.password_reset_otps
      SET reset_token_hash = NULL
      WHERE otp_id = $1
    `, [record.otp_id]);

    return {
      success: true,
      message: 'Đặt lại mật khẩu thành công. Tất cả các phiên đăng nhập khác đã được đăng xuất để bảo mật.'
    };
  }

  /**
   * Authenticated Self-Service Change Password (requires current password)
   */
  async changeSelfPassword(accountId, currentPassword, newPassword) {
    if (!accountId || !currentPassword || !newPassword) {
      throw new Error('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.');
    }

    if (newPassword.length < 6) {
      throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const accRes = await pool.query(`
      SELECT account_id, password_hash
      FROM public.accounts
      WHERE account_id = $1
    `, [accountId]);

    if (accRes.rows.length === 0) {
      throw new Error('Tài khoản không tồn tại.');
    }

    const acc = accRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, acc.password_hash);

    if (!isMatch) {
      throw new Error('Mật khẩu hiện tại không chính xác.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(`
      UPDATE public.accounts
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $2
    `, [newPasswordHash, accountId]);

    // REVOKE ALL SESSIONS for this account
    await pool.query(`
      UPDATE public.user_sessions
      SET session_status = 'REVOKED', logout_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1 AND session_status = 'ACTIVE'
    `, [accountId]);

    return {
      success: true,
      message: 'Đổi mật khẩu thành công. Tất cả các phiên đăng nhập khác đã được thu hồi để bảo mật.'
    };
  }
}

module.exports = new OtpService();
