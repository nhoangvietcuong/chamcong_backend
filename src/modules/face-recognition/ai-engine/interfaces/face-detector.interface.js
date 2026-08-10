/**
 * Interface contract for Face Detector
 */
class IFaceDetector {
  /**
   * Detects all faces in the image.
   * @param {Buffer} imageBuffer
   * @param {string} [filename]
   * @returns {Promise<Array<{box: {x: number, y: number, width: number, height: number}, score: number}>>}
   */
  async detect(imageBuffer, filename) {
    throw new Error('Method detect() must be implemented.');
  }
}

module.exports = IFaceDetector;
