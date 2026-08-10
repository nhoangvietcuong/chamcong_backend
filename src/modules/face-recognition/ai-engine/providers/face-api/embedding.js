const IFaceEmbeddingProvider = require('../../interfaces/face-embedding.interface');
const tensorflowService = require('../../../services/tensorflow.service');
const config = require('../../../config/face-ai-config');

class FaceApiProvider extends IFaceEmbeddingProvider {
  /**
   * Generates a 128D face embedding from aligned image buffer.
   */
  async generateEmbedding(alignedFaceBuffer, filename = '') {
    const res = await tensorflowService.generateEmbedding(alignedFaceBuffer, filename);
    return {
      embedding: res.embedding,
      version: config.faceModelVersion || 'v1'
    };
  }
}

module.exports = new FaceApiProvider();
