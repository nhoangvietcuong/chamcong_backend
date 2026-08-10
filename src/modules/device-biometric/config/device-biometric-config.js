/**
 * Device Biometric (WebAuthn) Configuration class.
 * Reads environment variables and exposes parsed configurations.
 * Prevents reading process.env directly inside other files.
 */
class DeviceBiometricConfig {
  constructor() {
    this.rpId = process.env.WEBAUTHN_RP_ID || 'localhost';
    this.rpName = process.env.WEBAUTHN_RP_NAME || 'ChamCong';
    this.origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
    this.timeout = parseInt(process.env.WEBAUTHN_TIMEOUT || '60000', 10);
    this.challengeTtl = parseInt(process.env.WEBAUTHN_CHALLENGE_TTL || '300', 10);
    this.maxDevices = parseInt(process.env.MAX_DEVICE_PER_EMPLOYEE || '5', 10);
    this.requireResidentKey = process.env.REQUIRE_RESIDENT_KEY !== 'false';
    this.userVerification = process.env.USER_VERIFICATION || 'required';
    this.deviceBiometricPolicy = process.env.DEVICE_BIOMETRIC_POLICY || 'always';
  }
}

module.exports = new DeviceBiometricConfig();
