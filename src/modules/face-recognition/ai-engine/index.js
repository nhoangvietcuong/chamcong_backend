const qualityAnalyzer = require('./providers/quality/quality-analyzer');
const livenessDetector = require('./providers/mediapipe/liveness');
const embeddingProvider = require('./providers/face-api/embedding');
const faceMatcher = require('./providers/matching/face-matcher');
const auditLogger = require('./providers/logging/audit-logger');

// Interface definition check helpers
const IFaceQualityAnalyzer = require('./interfaces/face-quality-analyzer.interface');
const ILivenessDetector = require('./interfaces/liveness-detector.interface');
const IFaceEmbeddingProvider = require('./interfaces/face-embedding.interface');
const IFaceMatcher = require('./interfaces/face-matcher.interface');
const IAuditLogger = require('./interfaces/audit-logger.interface');

class AIEngine {
  constructor() {
    this.qualityAnalyzer = qualityAnalyzer;
    this.livenessDetector = livenessDetector;
    this.embeddingProvider = embeddingProvider;
    this.faceMatcher = faceMatcher;
    this.auditLogger = auditLogger;

    this.validateDependencies();
  }

  validateDependencies() {
    // Assert interfaces are satisfied to enforce strict DI structure
    if (!(this.qualityAnalyzer instanceof IFaceQualityAnalyzer)) {
      throw new Error('qualityAnalyzer must implement IFaceQualityAnalyzer');
    }
    if (!(this.livenessDetector instanceof ILivenessDetector)) {
      throw new Error('livenessDetector must implement ILivenessDetector');
    }
    if (!(this.embeddingProvider instanceof IFaceEmbeddingProvider)) {
      throw new Error('embeddingProvider must implement IFaceEmbeddingProvider');
    }
    if (!(this.faceMatcher instanceof IFaceMatcher)) {
      throw new Error('faceMatcher must implement IFaceMatcher');
    }
    if (!(this.auditLogger instanceof IAuditLogger)) {
      throw new Error('auditLogger must implement IAuditLogger');
    }
  }
}

module.exports = new AIEngine();
