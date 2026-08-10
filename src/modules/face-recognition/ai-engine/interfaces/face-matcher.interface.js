/**
 * Interface contract for Face Matcher
 */
class IFaceMatcher {
  /**
   * Calculates similarity between two face embeddings.
   * @param {number[]} embedding1
   * @param {number[]} embedding2
   * @param {string} [filename]
   * @returns {number} Similarity score (0.0 to 1.0)
   */
  calculateSimilarity(embedding1, embedding2, filename) {
    throw new Error('Method calculateSimilarity() must be implemented.');
  }
}

module.exports = IFaceMatcher;
