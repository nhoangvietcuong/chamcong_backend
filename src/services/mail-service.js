const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');

class MailService {
  getTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return null;
    }

    if (host && host.includes('gmail')) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
      });
    }

    return nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
  }

  async sendOtpEmail(toEmail, otpCode, fullName = 'Nhân viên') {
    const transporter = this.getTransporter();
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@chamcong.vn';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #0f172a; text-align: center; margin-bottom: 8px;">Xác Nhận Khôi Phục Mật Khẩu</h2>
        <p style="color: #475569; font-size: 14px;">Xin chào <strong>${fullName}</strong>,</p>
        <p style="color: #475569; font-size: 14px;">Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với Email này.</p>
        <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 6px;">MÃ XÁC THỰC OTP (HIỆU LỰC 5 PHÚT)</span>
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; font-family: monospace;">${otpCode}</span>
        </div>
        <p style="color: #ef4444; font-size: 12px; font-weight: bold;">⚠️ Vui lòng không chia sẻ mã OTP này cho bất kỳ ai để bảo vệ an toàn cho tài khoản của bạn.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">Trân trọng,<br/>Hệ thống Chấm công & Quản lý Nhân sự</p>
      </div>
    `;

    if (!transporter) {
      console.log(`[MailService] SMTP env variables not set. Simulated OTP send to ${toEmail}: ${otpCode}`);
      return { success: true, mocked: true };
    }

    try {
      await transporter.sendMail({
        from: `"Chấm Công System" <${fromAddress}>`,
        to: toEmail,
        subject: `[${otpCode}] Mã OTP khôi phục mật khẩu`,
        html: htmlContent
      });
      return { success: true, mocked: false };
    } catch (err) {
      console.error('[MailService Error]', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new MailService();
