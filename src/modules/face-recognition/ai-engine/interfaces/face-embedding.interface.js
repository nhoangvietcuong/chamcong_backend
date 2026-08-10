/**
 * Interface contract for Face Embedding Provider
 */
class IFaceEmbeddingProvider {
  /**
   * Generates a face embedding vector.
   * @param {Buffer} alignedFaceBuffer
   * @param {string} [filename]
   * @returns {Promise<{embedding: number[], version: string}>}
   */
  async generateEmbedding(alignedFaceBuffer, filename) {
    throw new Error('Method generateEmbedding() must be implemented.');
  }
}

module.exports = IFaceEmbeddingProvider;
