const crypto = require('crypto');
const deviceBiometricConfig = require('../config/device-biometric-config');

class ChallengeService {
  constructor() {
    this.challenges = new Map(); // key: sessionId, value: { challenge, expiresAt }
  }

  generateChallenge() {
    return crypto.randomBytes(32).toString('base64url');
  }

  async storeChallenge(sessionId, challenge) {
    const ttlSeconds = deviceBiometricConfig.challengeTtl;
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.challenges.set(sessionId, { challenge, expiresAt });
  }

  async verifyChallenge(sessionId, clientChallenge) {
    const stored = this.challenges.get(sessionId);
    if (!stored) {
      return { valid: false, reason: 'INVALID_CHALLENGE' };
    }
    if (Date.now() > stored.expiresAt) {
      this.challenges.delete(sessionId);
      return { valid: false, reason: 'CHALLENGE_EXPIRED' };
    }
    if (stored.challenge !== clientChallenge) {
      return { valid: false, reason: 'INVALID_CHALLENGE' };
    }
    return { valid: true };
  }

  async expireChallenge(sessionId) {
    this.challenges.delete(sessionId);
  }

  async deleteChallenge(sessionId) {
    this.challenges.delete(sessionId);
  }
}

module.exports = new ChallengeService();
