const IFaceMatcher = require('../../interfaces/face-matcher.interface');
const tensorflowService = require('../../../services/tensorflow.service');

class FaceMatcherProvider extends IFaceMatcher {
  /**
   * Compares two embeddings.
   */
  calculateSimilarity(embedding1, embedding2, filename = '') {
    return tensorflowService.calculateSimilarity(embedding1, embedding2, filename);
  }
}

module.exports = new FaceMatcherProvider();
