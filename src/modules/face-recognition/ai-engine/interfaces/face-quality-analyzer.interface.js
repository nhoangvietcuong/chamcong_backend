/**
 * Interface contract for Face Quality Analyzer
 */
class IFaceQualityAnalyzer {
  /**
   * Evaluates image and face quality.
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {Object} [detection] - Bounding box or landmark data from detector
   * @param {string} [filename] - Original filename (for unit-test/mock scenarios)
   * @returns {Promise<{passed: boolean, score: number, blur: string, brightness: string, yaw: number, pitch: number, roll: number, message: string, reasonCode?: string}>}
   */
  async analyze(imageBuffer, detection, filename) {
    throw new Error('Method analyze() must be implemented.');
  }
}

module.exports = IFaceQualityAnalyzer;
