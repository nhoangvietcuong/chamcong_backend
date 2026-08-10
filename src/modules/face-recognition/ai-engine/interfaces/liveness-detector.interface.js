/**
 * Interface contract for Liveness Detector
 */
class ILivenessDetector {
  /**
   * Verifies face liveness (detects screens, printed photos, video replays, etc.)
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {string} [filename] - Original filename (for unit-test/mock scenarios)
   * @returns {Promise<{passed: boolean, confidence: number, reason?: string, details?: Object}>}
   */
  async verify(imageBuffer, filename) {
    throw new Error('Method verify() must be implemented.');
  }
}

module.exports = ILivenessDetector;
