const otpService = require('../services/otp-service');
const { pool } = require('../config/db');

describe('OtpService Security & Logic Tests', () => {
  afterAll(async () => {
    // Cleanup any test records
    await pool.query("DELETE FROM public.password_reset_otps WHERE destination = 'test@example.com' OR destination = '0999999999'");
  });

  test('HMAC SHA-256 hashing produces consistent digests and does not use BCrypt', () => {
    const otp = '123456';
    const hash1 = otpService.hashOtp(otp);
    const hash2 = otpService.hashOtp(otp);
    expect(hash1).toEqual(hash2);
    expect(hash1.length).toEqual(64); // SHA-256 hex string length
    expect(hash1).not.toContain('$2b$'); // Ensure NOT bcrypt
  });

  test('requestPasswordResetOtp returns generic message for both existing and non-existing accounts (Anti User-Enumeration)', async () => {
    const res1 = await otpService.requestPasswordResetOtp('non_existent_user_9999@test.com', 'EMAIL');
    const res2 = await otpService.requestPasswordResetOtp('admin', 'EMAIL');

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.message).toEqual(res2.message);
    expect(res1.message).toContain('Nếu thông tin tài khoản hợp lệ');
  });

  test('OTP verification fails gracefully for invalid OTP code', async () => {
    await expect(otpService.verifyPasswordResetOtp('non_existent_user_9999@test.com', '000000'))
      .rejects
      .toThrow('Mã OTP không hợp lệ hoặc đã hết hạn.');
  });
});
