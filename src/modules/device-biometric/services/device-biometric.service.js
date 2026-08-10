const deviceBiometricRepository = require('../repositories/device-biometric-repository');
const challengeService = require('./challenge.service');
const webauthnService = require('./webauthn.service');
const deviceBiometricConfig = require('../config/device-biometric-config');
const systemLogRepository = require('../../../repositories/system-log-repository');
const SYSTEM_ACTION = require('../../../constants/system-action.constants');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../errors/app-error');

class DeviceBiometricService {
  async registerCredential(employeeId, username, body, dbClient = null) {
    const { registrationResponse, deviceName } = body;

    try {
      // 1. Get stored challenge
      const cached = challengeService.challenges.get(body.sessionId);
      if (!cached) {
        throw new ValidationError('Invalid Challenge', 'INVALID_CHALLENGE');
      }

      // Check TTL
      if (Date.now() > cached.expiresAt) {
        challengeService.deleteChallenge(body.sessionId);
        throw new ValidationError('Challenge Expired', 'CHALLENGE_EXPIRED');
      }

      // 2. Check maximum devices per employee
      const activeCredentials = await deviceBiometricRepository.findByEmployee(employeeId, dbClient);
      if (activeCredentials.length >= deviceBiometricConfig.maxDevices) {
        throw new ConflictError('Maximum Device Reached', 'MAXIMUM_DEVICE_REACHED');
      }

      // 3. Check if credential already exists
      const existing = await deviceBiometricRepository.findCredential(registrationResponse.id, dbClient);
      if (existing) {
        throw new ConflictError('Credential Already Exists', 'CREDENTIAL_ALREADY_EXISTS');
      }

      // 4. Verify WebAuthn response
      let verification;
      try {
        verification = await webauthnService.verifyRegistrationResponse(
          registrationResponse,
          cached.challenge
        );
      } catch (err) {
        throw new ValidationError(`WebAuthn Error: ${err.message}`, 'WEBAUTHN_ERROR');
      }

      if (!verification.verified) {
        throw new ValidationError('Authentication Failed', 'AUTHENTICATION_FAILED');
      }

      const { credential } = verification.registrationInfo;

      // 5. Create new credential
      const newCred = await deviceBiometricRepository.createCredential({
        credentialId: credential.id,
        employeeId,
        credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
        credentialCounter: credential.counter,
        credentialDeviceName: deviceName || 'Unknown Device',
        transports: credential.transports || [],
        aaguid: credential.aaguid,
      }, dbClient);

      // 6. Log success
      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.DEVICE_REGISTERED,
        description: `Đăng ký thiết bị thành công: ${deviceName || 'Unknown Device'} (ID: ${credential.id})`,
        status: 'SUCCESS',
      }, dbClient).catch(() => {});

      // Delete challenge
      challengeService.deleteChallenge(body.sessionId);

      return newCred;
    } catch (err) {
      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.WEBAUTHN_REGISTER_FAILED,
        description: `Đăng ký thiết bị thất bại: ${err.message}`,
        status: 'FAILED',
      }, dbClient).catch(() => {});
      throw err;
    }
  }

  async authenticateCredential(employeeId, username, body, dbClient = null) {
    const { authenticationResponse } = body;

    try {
      // 1. Get stored challenge
      const cached = challengeService.challenges.get(body.sessionId);
      if (!cached) {
        throw new ValidationError('Invalid Challenge', 'INVALID_CHALLENGE');
      }

      if (Date.now() > cached.expiresAt) {
        challengeService.deleteChallenge(body.sessionId);
        throw new ValidationError('Challenge Expired', 'CHALLENGE_EXPIRED');
      }

      // 2. Fetch credential
      const credential = await deviceBiometricRepository.findCredential(authenticationResponse.id, dbClient);
      if (!credential) {
        throw new NotFoundError('Credential Not Found', 'CREDENTIAL_NOT_FOUND');
      }

      if (parseInt(credential.employee_id, 10) !== parseInt(employeeId, 10)) {
        throw new ForbiddenError('Credential Revoked', 'CREDENTIAL_REVOKED');
      }

      // 3. Verify assertion
      let verification;
      try {
        verification = await webauthnService.verifyAuthenticationResponse(
          authenticationResponse,
          cached.challenge,
          credential
        );
      } catch (err) {
        throw new ValidationError(`WebAuthn Error: ${err.message}`, 'WEBAUTHN_ERROR');
      }

      if (!verification.verified) {
        throw new ValidationError('Authentication Failed', 'AUTHENTICATION_FAILED');
      }

      const { newCounter } = verification.authenticationInfo;

      // 4. Counter check
      if (newCounter <= parseInt(credential.credential_counter, 10)) {
        throw new ValidationError('Invalid Signature', 'INVALID_SIGNATURE');
      }

      // 5. Update counter
      await deviceBiometricRepository.updateCounter(credential.credential_id, newCounter, dbClient);

      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.SIGNATURE_VERIFIED,
        description: `Xác thực chữ ký thiết bị thành công (ID: ${credential.credential_id})`,
        status: 'SUCCESS',
      }, dbClient).catch(() => {});

      // Delete challenge
      challengeService.deleteChallenge(body.sessionId);

      return { verified: true };
    } catch (err) {
      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.WEBAUTHN_AUTHENTICATE_FAILED,
        description: `Xác thực thiết bị thất bại: ${err.message}`,
        status: 'FAILED',
      }, dbClient).catch(() => {});
      throw err;
    }
  }

  async verifyDevice(employeeId, sessionId, body, dbClient = null) {
    const { deviceAuth } = body;

    // Check if employee has registered biometric credentials
    const credentials = await deviceBiometricRepository.findByEmployee(employeeId, dbClient);
    if (!credentials || credentials.length === 0) {
      return { verified: true };
    }

    // Check if device biometric is required
    const isRequired = deviceBiometricConfig.deviceBiometricPolicy === 'always';
    if (!isRequired && !deviceAuth) {
      return { verified: true };
    }

    if (!deviceAuth) {
      throw new ValidationError('Authentication Failed', 'AUTHENTICATION_FAILED');
    }

    // Reuse authenticateCredential logic
    return await this.authenticateCredential(employeeId, null, {
      authenticationResponse: deviceAuth,
      sessionId,
    }, dbClient);
  }

  async listCredentials(employeeId, dbClient = null) {
    return await deviceBiometricRepository.findByEmployee(employeeId, dbClient);
  }

  async deleteCredential(employeeId, credentialId, dbClient = null) {
    const credential = await deviceBiometricRepository.findCredential(credentialId, dbClient);
    if (!credential) {
      throw new NotFoundError('Credential Not Found', 'CREDENTIAL_NOT_FOUND');
    }

    if (parseInt(credential.employee_id, 10) !== parseInt(employeeId, 10)) {
      throw new ForbiddenError('Credential Revoked', 'CREDENTIAL_REVOKED');
    }

    const deleted = await deviceBiometricRepository.softDelete(credentialId, dbClient);

    await systemLogRepository.createLog({
      employeeId,
      action: SYSTEM_ACTION.DEVICE_REMOVED,
      description: `Xóa thiết bị thành công (ID: ${credentialId})`,
      status: 'SUCCESS',
    }, dbClient).catch(() => {});

    return deleted;
  }
}

module.exports = new DeviceBiometricService();
