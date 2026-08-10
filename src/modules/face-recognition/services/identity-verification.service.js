const mediapipeService = require('./mediapipe.service');
const tensorflowService = require('./tensorflow.service');
const faceProfileRepository = require('../repositories/face-profile-repository');
const config = require('../config/face-ai-config');
const { pool } = require('../../../config/db');
const systemLogRepository = require('../../../repositories/system-log-repository');
const SYSTEM_ACTION = require('../../../constants/system-action.constants');

const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  AppError
} = require('../../../errors/app-error');

const ERROR_CODE = require('../../../constants/error-code.constants');

class IdentityVerificationService {
  async _retryOnTransientAiFailure(fn) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.status === 503 || err.errorCode === 'MEDIAPIPE_WASM_ERROR' || err.errorCode === 'AI_UNAVAILABLE';
      if (isTransient) {
        console.warn('⚠️ Transient AI failure encountered. Retrying automatic attempt 1/1...');
        return await fn();
      }
      throw err;
    }
  }

  /**
   * Orchestrates the registration of an employee's face profile inside a DB Transaction
   */
  async registerFace(employeeId, imageBuffer, filename, dbClient = pool) {
    const isNewClient = dbClient === pool;
    const client = isNewClient ? await pool.connect() : dbClient;

    try {
      if (isNewClient) await client.query('BEGIN');

      // 1. Verify that no active profile exists (Must update or delete first)
      const existingActive = await faceProfileRepository.findActiveProfile(employeeId, client);
      if (existingActive) {
        throw new ConflictError('Khuôn mặt đã được đăng ký trước đó. Vui lòng cập nhật hoặc xóa trước.', 'FACE_ALREADY_REGISTERED');
      }

      // 2. Run face detection, alignment and quality check via MediaPipe
      const detection = await this._retryOnTransientAiFailure(() =>
        mediapipeService.detectFace(imageBuffer, filename)
      );

      this._validateDetection(detection, employeeId);

      // 3. Generate Face Embedding via TensorFlow
      const res = await this._retryOnTransientAiFailure(() =>
        tensorflowService.generateEmbedding(detection.alignedImage, filename)
      );
      const embedding = res.embedding;

      // 4. Cross-employee duplicate face detection
      await this._checkCrossEmployeeDuplicate(employeeId, embedding, client);

      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.EMBEDDING_CREATED,
        description: 'Sinh Face Embedding thành công khi đăng ký khuôn mặt',
        status: 'SUCCESS'
      }, client).catch(() => { });

      // 5. Save to database
      const profile = await faceProfileRepository.createFaceProfile({
        employeeId,
        embedding,
        embeddingVersion: config.faceModelVersion,
        provider: config.faceModel
      }, client);

      if (isNewClient) await client.query('COMMIT');
      return profile;
    } catch (err) {
      if (isNewClient) await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      if (isNewClient) client.release();
    }
  }

  /**
   * Orchestrates updating the employee's registered face profile inside a DB Transaction
   */
  async updateFace(employeeId, imageBuffer, filename, dbClient = pool) {
    const isNewClient = dbClient === pool;
    const client = isNewClient ? await pool.connect() : dbClient;

    try {
      if (isNewClient) await client.query('BEGIN');

      // 1. Verify that an active profile exists
      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId, client);
      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy thông tin đăng ký khuôn mặt để cập nhật', 'FACE_PROFILE_NOT_FOUND');
      }

      // 2. Run face detection and quality check
      const detection = await this._retryOnTransientAiFailure(() =>
        mediapipeService.detectFace(imageBuffer, filename)
      );

      this._validateDetection(detection, employeeId);

      // 3. Generate new embedding
      const res = await this._retryOnTransientAiFailure(() =>
        tensorflowService.generateEmbedding(detection.alignedImage, filename)
      );
      const embedding = res.embedding;

      // 4. Cross-employee duplicate face detection
      await this._checkCrossEmployeeDuplicate(employeeId, embedding, client);

      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.EMBEDDING_CREATED,
        description: 'Sinh Face Embedding thành công khi cập nhật khuôn mặt',
        status: 'SUCCESS'
      }, client).catch(() => { });

      // 5. Update the profile
      const profile = await faceProfileRepository.updateFaceProfile(activeProfile.faceProfileId, {
        embedding,
        embeddingVersion: config.faceModelVersion,
        provider: config.faceModel
      }, client);

      if (isNewClient) await client.query('COMMIT');
      return profile;
    } catch (err) {
      if (isNewClient) await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      if (isNewClient) client.release();
    }
  }

  /**
   * Soft deletes the employee's registered face profile
   */
  async deleteFace(employeeId, dbClient = pool) {
    // 1. Verify profile exists
    const activeProfile = await faceProfileRepository.findActiveProfile(employeeId, dbClient);
    if (!activeProfile) {
      throw new NotFoundError('Không tìm thấy thông tin đăng ký khuôn mặt để xóa', 'FACE_PROFILE_NOT_FOUND');
    }

    // 2. Soft delete (set status = 0)
    return await faceProfileRepository.softDelete(employeeId, dbClient);
  }

  /**
   * Performs face verification comparing a uploaded photo against the registered embedding
   */
  async verifyIdentity(employeeId, imageBuffer, filename = '', preFetchedProfile = null) {
    // 1. Get active profile
    const activeProfile = preFetchedProfile || await faceProfileRepository.findActiveProfile(employeeId);
    if (!activeProfile) {
      throw new NotFoundError('Không tìm thấy dữ liệu khuôn mặt đã đăng ký', 'FACE_PROFILE_NOT_FOUND');
    }

    // 2. Detect face
    let detection;
    try {
      detection = await mediapipeService.detectFace(imageBuffer, filename);
    } catch (err) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.MEDIAPIPE_ERROR,
        description: `Lỗi MediaPipe khi xác thực khuôn mặt: ${err.message}`,
        status: 'FAILED'
      }).catch(() => { });
      throw err;
    }

    this._validateDetection(detection, employeeId);

    // 3. Generate embedding
    let embedding;
    try {
      const res = await tensorflowService.generateEmbedding(detection.alignedImage, filename);
      embedding = res.embedding;
    } catch (err) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.TENSORFLOW_ERROR,
        description: `Lỗi TensorFlow khi xác thực khuôn mặt: ${err.message}`,
        status: 'FAILED'
      }).catch(() => { });
      throw err;
    }

    systemLogRepository.createLog({
      employeeId,
      action: SYSTEM_ACTION.EMBEDDING_CREATED,
      description: 'Sinh Face Embedding thành công khi xác thực khuôn mặt',
      status: 'SUCCESS'
    }).catch(() => { });

    // 4. Compare embeddings - extract flat vector from multi-embedding format
    let storedVectors = [];
    const dbEmb = activeProfile.embedding;
    if (Array.isArray(dbEmb)) {
      if (typeof dbEmb[0] === 'number') {
        storedVectors = [dbEmb];
      } else if (typeof dbEmb[0] === 'object' && dbEmb[0] !== null) {
        storedVectors = dbEmb.filter(e => Array.isArray(e.embedding) && e.embedding.length === 128).map(e => e.embedding);
      }
    }

    if (storedVectors.length === 0) {
      throw new NotFoundError('Dữ liệu khuôn mặt đã lưu không hợp lệ', 'FACE_PROFILE_INVALID');
    }

    // Use best match across all stored vectors (minimum distance)
    let bestSimilarity = 0;
    let bestVector = storedVectors[0];
    for (const vec of storedVectors) {
      const sim = tensorflowService.calculateSimilarity(embedding, vec, filename);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestVector = vec;
      }
    }

    const rawSimilarity = bestSimilarity;
    const distance = parseFloat((1 - rawSimilarity).toFixed(4));
    const threshold = config.faceSimilarityThreshold;

    // Scale similarity if threshold is high (above 0.70) to align with main shift math
    const similarity = threshold >= 0.70
      ? parseFloat(Math.max(0, 1.0 - 0.36 * distance).toFixed(4))
      : rawSimilarity;

    const passed = similarity >= threshold;

    // Helper to calculate statistics of a 128D vector
    const getVectorStats = (vec) => {
      if (!vec || !Array.isArray(vec) || vec.length === 0) {
        return { len: 0, min: 0, max: 0, mean: 0, std: 0 };
      }
      const len = vec.length;
      let min = vec[0], max = vec[0], sum = 0;
      for (let i = 0; i < len; i++) {
        const val = vec[i];
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
      }
      const mean = sum / len;
      let varSum = 0;
      for (let i = 0; i < len; i++) {
        const diff = vec[i] - mean;
        varSum += diff * diff;
      }
      return {
        len,
        min: parseFloat(min.toFixed(4)),
        max: parseFloat(max.toFixed(4)),
        mean: parseFloat(mean.toFixed(4)),
        std: parseFloat(Math.sqrt(varSum / len).toFixed(4))
      };
    };

    const capStats = getVectorStats(embedding);
    const regStats = getVectorStats(bestVector);

    console.log('==================================================');
    console.log('[FACE MATCHING DETAILED DIAGNOSTIC LOG]');
    console.log(`Current Employee ID        : ${employeeId}`);
    console.log(`Stored Face Profile ID     : ${activeProfile.faceProfileId}`);
    console.log(`Stored Employee ID         : ${activeProfile.employeeId}`);
    console.log(`Registration Descriptor    : [Len=${regStats.len}, Min=${regStats.min}, Max=${regStats.max}, Mean=${regStats.mean}, Std=${regStats.std}]`);
    console.log(`Check-in Descriptor        : [Len=${capStats.len}, Min=${capStats.min}, Max=${capStats.max}, Mean=${capStats.mean}, Std=${capStats.std}]`);
    console.log(`Euclidean Distance         : ${distance}`);
    console.log(`Similarity Score (1 - Dist): ${similarity}`);
    console.log(`Configured Threshold       : ${threshold}`);
    console.log(`Match Result               : ${passed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log('==================================================');

    systemLogRepository.createLog({
      employeeId,
      action: SYSTEM_ACTION.EMBEDDING_COMPARE,
      description: `So sánh Face Embedding thành công (Độ trùng khớp ${similarity}, Distance ${distance})`,
      status: 'SUCCESS'
    }).catch(() => { });

    // 5. Verify similarity score against threshold
    if (!passed) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.FACE_VERIFY_FAILED,
        description: `Xác thực khuôn mặt thất bại (Độ trùng khớp ${similarity} dưới ngưỡng ${threshold})`,
        status: 'FAILED'
      }).catch(() => { });

      return {
        success: false,
        passed: false,
        similarity,
        reason: `Xác thực khuôn mặt thất bại (Độ trùng khớp ${similarity} dưới ngưỡng ${threshold})`
      };
    }

    return {
      success: true,
      passed: true,
      similarity,
      reason: null
    };
  }

  /**
   * Helper to validate MediaPipe face detection results and throw appropriate HTTP errors
   */
  _validateDetection(detection, employeeId = null) {
    if (!detection.detected) {
      const isNoFace = detection.reason === 'NO_FACE_DETECTED';
      const msg = isNoFace ? 'Không phát hiện thấy khuôn mặt trong ảnh' : 'Không tìm thấy khuôn mặt hợp lệ';
      const code = 'NO_FACE_DETECTED';

      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.QUALITY_FAILED,
        description: `Kiểm tra khuôn mặt thất bại: ${msg}`,
        status: 'FAILED'
      }).catch(() => { });

      throw new BadRequestError(msg, code);
    }

    if (detection.faceCount > 1) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.QUALITY_FAILED,
        description: 'Kiểm tra khuôn mặt thất bại: Phát hiện nhiều hơn 1 khuôn mặt trong ảnh',
        status: 'FAILED'
      }).catch(() => { });

      throw new BadRequestError('Phát hiện thấy nhiều khuôn mặt trong ảnh (yêu cầu chỉ có 1 khuôn mặt)', 'MULTIPLE_FACES_DETECTED');
    }

    if (detection.faceWidth < config.faceMinSize) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.QUALITY_FAILED,
        description: `Kiểm tra khuôn mặt thất bại: Kích thước khuôn mặt quá nhỏ (${detection.faceWidth}px < tối thiểu ${config.faceMinSize}px)`,
        status: 'FAILED'
      }).catch(() => { });

      throw new BadRequestError(`Khuôn mặt quá nhỏ (yêu cầu kích thước tối thiểu ${config.faceMinSize}px)`, 'FACE_TOO_SMALL');
    }

    if (detection.quality < config.faceQualityThreshold) {
      systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.QUALITY_FAILED,
        description: `Kiểm tra khuôn mặt thất bại: Chất lượng ảnh không đạt (${detection.quality} < tối thiểu ${config.faceQualityThreshold})`,
        status: 'FAILED'
      }).catch(() => { });

      throw new BadRequestError('Chất lượng ảnh khuôn mặt không đạt (quá mờ hoặc thiếu sáng)', 'LOW_FACE_QUALITY');
    }
  }
}

module.exports = new IdentityVerificationService();
