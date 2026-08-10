/**
 * Interface contract for Face Landmark Extractor
 */
class IFaceLandmark {
  /**
   * Extracts landmarks from the detected face.
   * @param {Buffer} imageBuffer
   * @param {Object} boundingBox
   * @returns {Promise<Object>} Facial landmarks (e.g. 68 points or 468 points mesh)
   */
  async extractLandmarks(imageBuffer, boundingBox) {
    throw new Error('Method extractLandmarks() must be implemented.');
  }
}

module.exports = IFaceLandmark;
