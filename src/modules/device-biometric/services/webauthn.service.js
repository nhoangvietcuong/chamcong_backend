const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const deviceBiometricConfig = require('../config/device-biometric-config');

class WebAuthnService {
  async generateRegistrationOptions(employeeId, username, attachment = null) {
    const selection = {
      residentKey: deviceBiometricConfig.requireResidentKey ? 'required' : 'discouraged',
      userVerification: deviceBiometricConfig.userVerification,
    };

    if (attachment === 'platform' || attachment === 'cross-platform') {
      selection.authenticatorAttachment = attachment;
    }

    return await generateRegistrationOptions({
      rpName: deviceBiometricConfig.rpName,
      rpID: deviceBiometricConfig.rpId,
      userID: Buffer.from(String(employeeId)),
      userName: username,
      timeout: deviceBiometricConfig.timeout,
      attestationType: 'none',
      authenticatorSelection: selection,
    });
  }

  async verifyRegistrationResponse(response, expectedChallenge) {
    if (process.env.MOCK_WEBAUTHN === 'true') {
      if (response.id === 'mock_fail_verification') {
        return { verified: false };
      }
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: response.id,
            publicKey: Buffer.from('mock_public_key_bytes_which_are_fake'),
            counter: 0,
            transports: response.transports || ['internal'],
            aaguid: 'mock_aaguid',
          },
        },
      };
    }

    return await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: deviceBiometricConfig.origin,
      expectedRPID: deviceBiometricConfig.rpId,
      requireUserVerification: deviceBiometricConfig.userVerification === 'required',
    });
  }

  async generateAuthenticationOptions(employeeId, credentials) {
    const allowCredentials = credentials.map((cred) => ({
      id: cred.credential_id,
      type: 'public-key',
      transports: cred.transports || [],
    }));

    return await generateAuthenticationOptions({
      rpID: deviceBiometricConfig.rpId,
      allowCredentials,
      timeout: deviceBiometricConfig.timeout,
      userVerification: deviceBiometricConfig.userVerification,
    });
  }

  async verifyAuthenticationResponse(response, expectedChallenge, storedCredential) {
    if (process.env.MOCK_WEBAUTHN === 'true') {
      if (response.id === 'mock_fail_verification') {
        return { verified: false };
      }
      return {
        verified: true,
        authenticationInfo: {
          newCounter: parseInt(storedCredential.credential_counter, 10) + 1,
        },
      };
    }

    // Parse stored transports if they are string/array
    let transports = storedCredential.transports;
    if (typeof transports === 'string') {
      try {
        transports = JSON.parse(transports);
      } catch (e) {
        transports = [];
      }
    }

    const credential = {
      id: storedCredential.credential_id,
      publicKey: Buffer.from(storedCredential.credential_public_key, 'base64url'),
      counter: parseInt(storedCredential.credential_counter, 10),
      transports,
    };

    return await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: deviceBiometricConfig.origin,
      expectedRPID: deviceBiometricConfig.rpId,
      credential,
      requireUserVerification: deviceBiometricConfig.userVerification === 'required',
    });
  }
}

module.exports = new WebAuthnService();
