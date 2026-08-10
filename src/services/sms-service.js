const axios = require('axios');

class SmsService {
  async sendOtpSms(toPhone, otpCode) {
    const smsApiKey = process.env.SMS_API_KEY;
    const smsProvider = process.env.SMS_PROVIDER || 'MOCK';
    const senderId = process.env.SMS_SENDER_ID || 'CHAMCONG';

    if (!smsApiKey || smsProvider.toUpperCase() === 'MOCK') {
      console.log(`[SmsService] SMS Provider set to MOCK. Simulated OTP send to ${toPhone}: ${otpCode}`);
      return { success: true, mocked: true };
    }

    try {
      if (smsProvider.toUpperCase() === 'SPEEDSMS') {
        const response = await axios.post('https://api.speedsms.vn/index.php/sms/send', {
          to: [toPhone],
          content: `[ChamCong] Ma OTP khoi phuc mat khau cua ban la: ${otpCode}. Hieu luc trong 5 phut.`,
          sms_type: 2,
          sender: senderId
        }, {
          headers: { 'Authorization': `Basic ${Buffer.from(smsApiKey + ':x').toString('base64')}` }
        });
        return { success: response.data && response.data.status === 'success', data: response.data };
      }

      const response = await axios.post(process.env.SMS_API_URL || 'https://api.sms-gateway.vn/v1/send', {
        apiKey: smsApiKey,
        phone: toPhone,
        message: `[ChamCong] Ma OTP khoi phuc mat khau cua ban la ${otpCode}. Hieu luc 5 phut.`
      });
      return { success: true, data: response.data };
    } catch (err) {
      console.error('[SmsService Error]', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new SmsService();
