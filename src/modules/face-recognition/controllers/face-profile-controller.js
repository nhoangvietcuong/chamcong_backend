const fs = require('fs');
const identityVerificationService = require('../services/identity-verification.service');
const faceProfileRepository = require('../repositories/face-profile-repository');
const fileStorageService = require('../../../services/file-storage-service');
const ROLE = require('../../../constants/role.constants');

const {
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ConflictError
} = require('../../../errors/app-error');

const ERROR_CODE = require('../../../constants/error-code.constants');
const systemLogRepository = require('../../../repositories/system-log-repository');
const SYSTEM_ACTION = require('../../../constants/system-action.constants');

class FaceProfileController {
  /**
   * Registers a new face profile for the logged in employee
   */
  async registerFace(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được đăng ký khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const imageBuffer = fs.readFileSync(req.file.path);

      const profile = await identityVerificationService.registerFace(
        employeeId,
        imageBuffer,
        req.file.originalname
      );

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.FACE_REGISTER,
        description: 'Đăng ký khuôn mặt thành công',
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(201).json({
        success: true,
        message: 'Đăng ký khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          registeredAt: profile.registeredAt
        }
      });
    } catch (err) {
      next(err);
    } finally {
      // Clean up disk file as the embedding is now generated
      if (req.file && req.file.path) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
    }
  }

  /**
   * Updates the face profile for the logged in employee
   */
  async updateFace(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được cập nhật khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const imageBuffer = fs.readFileSync(req.file.path);

      const profile = await identityVerificationService.updateFace(
        employeeId,
        imageBuffer,
        req.file.originalname
      );

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.FACE_UPDATE,
        description: 'Cập nhật khuôn mặt thành công',
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Cập nhật khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          updatedAt: profile.updatedAt
        }
      });
    } catch (err) {
      next(err);
    } finally {
      if (req.file && req.file.path) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
    }
  }

  /**
   * Soft deletes the face profile of the logged in employee
   */
  async deleteFace(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được xóa khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      await identityVerificationService.deleteFace(employeeId);

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.FACE_DELETE,
        description: 'Xóa khuôn mặt thành công',
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Xóa khuôn mặt thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Gets details of the registered profile (Excluding embedding array for security/performance)
   */
  async getProfile(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được xem hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const profile = await faceProfileRepository.findActiveProfile(employeeId);

      if (!profile) {
        throw new NotFoundError('Không tìm thấy thông tin đăng ký khuôn mặt', ERROR_CODE.FACE_PROFILE_NOT_FOUND);
      }

      res.status(200).json({
        success: true,
        message: 'Lấy thông tin khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          registeredAt: profile.registeredAt,
          updatedAt: profile.updatedAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Returns whether a face profile has been registered
   */
  async getStatus(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được kiểm tra trạng thái khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const profile = await faceProfileRepository.findActiveProfile(employeeId);

      res.status(200).json({
        success: true,
        message: 'Lấy trạng thái đăng ký khuôn mặt thành công',
        data: {
          registered: !!profile
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Manually verify face similarity against the registered profile
   */
  async verifyFace(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được xác thực khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const imageBuffer = fs.readFileSync(req.file.path);

      const verification = await identityVerificationService.verifyIdentity(
        employeeId,
        imageBuffer,
        req.file.originalname
      );

      if (!verification.passed) {
        return res.status(403).json({
          success: false,
          message: verification.reason || 'Xác thực khuôn mặt thất bại',
          errorCode: 'SIMILARITY_TOO_LOW',
          data: {
            status: 'FAIL',
            similarity: verification.similarity
          }
        });
      }

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.FACE_VERIFY,
        description: `Xác thực khuôn mặt thủ công thành công (Độ trùng khớp ${verification.similarity})`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Xác thực khuôn mặt trùng khớp',
        data: {
          status: 'PASS',
          similarity: verification.similarity
        }
      });
    } catch (err) {
      if (req.auth) {
        systemLogRepository.createLog({
          employeeId: req.auth.employeeId,
          accountId: req.auth.accountId,
          action: SYSTEM_ACTION.FACE_VERIFY_FAILED,
          description: `Xác thực khuôn mặt thủ công thất bại: ${err.message}`,
          deviceFingerprint: req.auth.deviceFingerprint,
          ipAddress: req.ip,
          status: 'FAILED'
        }).catch(() => { });
      }

      // Catch ForbiddenError and return formatted FAIL response instead of default error format
      if (err.errorCode === 'SIMILARITY_TOO_LOW') {
        return res.status(403).json({
          success: false,
          message: err.message,
          errorCode: err.errorCode,
          data: {
            status: 'FAIL',
            similarity: parseFloat(err.message.match(/(\d+\.\d+)/)?.[0] || '0')
          }
        });
      }
      next(err);
    } finally {
      if (req.file && req.file.path) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
    }
  }

  /**
   * ADMIN: Get list of face profiles with pagination & filtering
   */
  async getAdminFaceProfiles(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập danh sách hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { keyword, status } = req.query;

      const result = await faceProfileRepository.findAndCountAdminFaceProfiles({
        page,
        limit,
        keyword,
        status
      });

      const { getPagination } = require('../../../utils/pagination');
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách hồ sơ khuôn mặt thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Enable or disable face profile
   */
  async updateStatusAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền thay đổi trạng thái hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const { profileId } = req.params;
      const { status } = req.body;

      if (status !== 0 && status !== 1) {
        throw new BadRequestError('Trạng thái không hợp lệ (chỉ nhận 0 hoặc 1)', ERROR_CODE.INVALID_INPUT);
      }

      const profile = await faceProfileRepository.updateStatusAdmin(profileId, status);
      if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ khuôn mặt', ERROR_CODE.FACE_PROFILE_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: profile.employeeId,
        accountId: req.auth.accountId,
        action: status === 1 ? 'FACE_PROFILE_ENABLED' : 'FACE_PROFILE_DISABLED',
        description: `${status === 1 ? 'Kích hoạt' : 'Vô hiệu hóa'} hồ sơ khuôn mặt ID ${profileId}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: `${status === 1 ? 'Kích hoạt' : 'Vô hiệu hóa'} hồ sơ khuôn mặt thành công`,
        data: profile
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Soft delete a face profile to allow re-registration
   */
  async deleteProfileAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền xóa hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const { profileId } = req.params;
      let profile = await faceProfileRepository.deleteProfileAdmin(profileId);

      if (!profile) {
        profile = await faceProfileRepository.softDelete(profileId);
      }

      if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ khuôn mặt', ERROR_CODE.FACE_PROFILE_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: profile.employeeId,
        accountId: req.auth.accountId,
        action: 'FACE_PROFILE_DELETED',
        description: `Xóa hồ sơ khuôn mặt (Profile ID: ${profile.faceProfileId}, Employee ID: ${profile.employeeId})`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Xóa hồ sơ khuôn mặt thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Get profile by employeeId
   */
  async getProfileByEmployeeIdAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }
      const { employeeId } = req.params;
      const profile = await faceProfileRepository.findActiveProfile(employeeId);
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Delete profile by employeeId
   */
  async deleteProfileByEmployeeIdAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền xóa hồ sơ khuôn mặt', ERROR_CODE.FORBIDDEN);
      }
      const { employeeId } = req.params;
      const profile = await faceProfileRepository.softDelete(employeeId);

      if (profile) {
        await systemLogRepository.createLog({
          employeeId: parseInt(employeeId, 10),
          accountId: req.auth.accountId,
          action: 'FACE_PROFILE_DELETED_BY_EMPLOYEE_ID',
          description: `Xóa hồ sơ khuôn mặt của nhân viên ID ${employeeId} (yêu cầu đăng ký lại)`,
          deviceFingerprint: req.auth.deviceFingerprint,
          ipAddress: req.ip,
          status: 'SUCCESS'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Xóa hồ sơ khuôn mặt thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Register a new face profile for an employee
   */
  async registerFaceAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền đăng ký khuôn mặt cho nhân viên', ERROR_CODE.FORBIDDEN);
      }

      const { employeeId } = req.params;
      const imageBuffer = fs.readFileSync(req.file.path);

      const profile = await identityVerificationService.registerFace(
        parseInt(employeeId, 10),
        imageBuffer,
        req.file.originalname
      );

      await systemLogRepository.createLog({
        employeeId: parseInt(employeeId, 10),
        accountId: req.auth.accountId,
        action: 'FACE_PROFILE_REGISTERED_BY_ADMIN',
        description: `Admin đăng ký khuôn mặt thành công cho nhân viên ID ${employeeId}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(201).json({
        success: true,
        message: 'Đăng ký khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          registeredAt: profile.registeredAt
        }
      });
    } catch (err) {
      next(err);
    } finally {
      if (req.file && req.file.path) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
    }
  }

  /**
   * ADMIN: Update face profile for an employee
   */
  async updateFaceAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền cập nhật khuôn mặt cho nhân viên', ERROR_CODE.FORBIDDEN);
      }

      const { employeeId } = req.params;
      const imageBuffer = fs.readFileSync(req.file.path);

      const profile = await identityVerificationService.updateFace(
        parseInt(employeeId, 10),
        imageBuffer,
        req.file.originalname
      );

      await systemLogRepository.createLog({
        employeeId: parseInt(employeeId, 10),
        accountId: req.auth.accountId,
        action: 'FACE_PROFILE_UPDATED_BY_ADMIN',
        description: `Admin cập nhật khuôn mặt thành công cho nhân viên ID ${employeeId}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Cập nhật khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          updatedAt: profile.updatedAt
        }
      });
    } catch (err) {
      next(err);
    } finally {
      if (req.file && req.file.path) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
    }
  }


  /**
   * Verify identity using client-computed face embedding (browser WebGL)
   * Supports 1-to-N matching against all stored templates of the employee.
   */
  async verifyEmbedding(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được xác thực khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const { embedding } = req.body;

      if (!embedding || !Array.isArray(embedding) || embedding.length !== 128) {
        throw new BadRequestError(
          `Embedding khuôn mặt không hợp lệ (cần mảng 128D, nhận được ${embedding ? embedding.length : 0}D)`,
          'INVALID_EMBEDDING'
        );
      }

      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId);
      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy dữ liệu khuôn mặt đã đăng ký', 'FACE_PROFILE_NOT_FOUND');
      }

      // Parse stored embeddings
      let storedEmbeddings = [];
      const dbEmb = activeProfile.embedding;
      if (Array.isArray(dbEmb)) {
        if (typeof dbEmb[0] === 'number') {
          storedEmbeddings = [{ embedding: dbEmb, pose: 'STRAIGHT' }];
        } else if (typeof dbEmb[0] === 'object' && dbEmb[0] !== null) {
          storedEmbeddings = dbEmb;
        }
      }

      if (storedEmbeddings.length === 0) {
        throw new BadRequestError('Dữ liệu khuôn mặt đã đăng ký không hợp lệ.', 'STORED_EMBEDDING_INVALID');
      }

      // Check L2-norm of the first template to detect and reject old degenerate WASM embeddings


      // 1-to-N Match (Min Euclidean Distance)
      let minDistance = 999;
      let matchedPose = 'UNKNOWN';

      for (const stored of storedEmbeddings) {
        if (!stored.embedding || stored.embedding.length !== 128) continue;

        let sumSq = 0;
        for (let i = 0; i < 128; i++) {
          const diff = embedding[i] - stored.embedding[i];
          sumSq += diff * diff;
        }
        const distance = Math.sqrt(sumSq);

        if (distance < minDistance) {
          minDistance = distance;
          matchedPose = stored.pose || 'STRAIGHT';
        }
      }

      const similarityThreshold = parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.82');
      const distanceThreshold = (1.0 - similarityThreshold) / 0.36;
      const passed = minDistance <= distanceThreshold;

      // Ánh xạ khoảng cách Euclid sang tỷ lệ phần trăm Độ tương đồng (Similarity)
      // d = 0.0 -> similarity = 1.0
      // d = 0.50 (distanceThreshold khi similarity = 0.82) -> similarity = 0.82
      const similarity = Math.max(0, 1.0 - 0.36 * minDistance);

      console.log('==================================================');
      console.log('[CLIENT-SIDE MULTI-EMBEDDING VERIFY]');
      console.log(`Employee ID     : ${employeeId}`);
      console.log(`Similarity      : ${similarity.toFixed(4)}`);
      console.log(`Threshold       : ${similarityThreshold}`);
      console.log(`Decision        : ${passed ? 'PASS' : 'FAIL'}`);
      console.log('==================================================');

      systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: passed ? SYSTEM_ACTION.FACE_VERIFY : SYSTEM_ACTION.FACE_VERIFY_FAILED,
        description: `Xác thực khuôn mặt (eKYC 1-to-N): Similarity=${similarity.toFixed(4)}, Threshold=${similarityThreshold}, Decision=${passed ? 'PASS' : 'FAIL'}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: passed ? 'SUCCESS' : 'FAILED'
      }).catch(() => { });

      if (!passed) {
        return res.status(403).json({
          success: false,
          message: `Xác thực khuôn mặt thất bại (Độ tương đồng ${similarity.toFixed(4)} dưới ngưỡng ${similarityThreshold})`,
          errorCode: 'SIMILARITY_TOO_LOW',
          data: { status: 'FAIL', similarity }
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Xác thực khuôn mặt trùng khớp',
        data: { status: 'PASS', similarity, pose: matchedPose }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Register face profile using client-computed multi-embeddings (eKYC array)
   */
  async registerEmbedding(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được đăng ký khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const { embeddings } = req.body; // Array of objects: { embedding: number[], pose: string, quality: number }

      if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
        throw new BadRequestError('Bộ embeddings đăng ký không hợp lệ', 'INVALID_EMBEDDING_SET');
      }

      // Check no active profile exists
      const existingActive = await faceProfileRepository.findActiveProfile(employeeId);
      if (existingActive) {
        throw new ConflictError(
          'Khuôn mặt đã được đăng ký trước đó. Vui lòng cập nhật hoặc xóa trước.',
          'FACE_ALREADY_REGISTERED'
        );
      }

      const profile = await faceProfileRepository.createFaceProfile({
        employeeId,
        embedding: embeddings, // Store directly as JSONB array
        embeddingVersion: 'face-api-v1-client-webgl',
        provider: 'face-api-client'
      });

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.FACE_REGISTER,
        description: `Đăng ký khuôn mặt eKYC thành công (Lưu ${embeddings.length} mẫu WebGL)`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      return res.status(201).json({
        success: true,
        message: 'Đăng ký khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          registeredAt: profile.registeredAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update face profile using client-computed multi-embeddings (eKYC array)
   */
  async updateEmbedding(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được cập nhật khuôn mặt', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const { embeddings } = req.body;

      if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
        throw new BadRequestError('Bộ embeddings cập nhật không hợp lệ', 'INVALID_EMBEDDING_SET');
      }

      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId);
      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ khuôn mặt để cập nhật', 'FACE_PROFILE_NOT_FOUND');
      }

      const profile = await faceProfileRepository.updateFaceProfile(activeProfile.faceProfileId, {
        embedding: embeddings,
        embeddingVersion: 'face-api-v1-client-webgl',
        provider: 'face-api-client'
      });

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: SYSTEM_ACTION.EMBEDDING_CREATED,
        description: `Cập nhật khuôn mặt eKYC thành công (Cập nhật ${embeddings.length} mẫu WebGL)`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      return res.status(200).json({
        success: true,
        message: 'Cập nhật khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          updatedAt: profile.updatedAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Register face profile using client-computed multi-embeddings for a specific employee
   */
  async registerEmbeddingAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền đăng ký khuôn mặt cho nhân viên', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = parseInt(req.params.employeeId, 10);
      const { embeddings } = req.body;

      if (isNaN(employeeId)) {
        throw new BadRequestError('ID nhân viên không hợp lệ', ERROR_CODE.INVALID_INPUT);
      }

      if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
        throw new BadRequestError('Bộ embeddings đăng ký không hợp lệ', 'INVALID_EMBEDDING_SET');
      }

      // Check no active profile exists
      const existingActive = await faceProfileRepository.findActiveProfile(employeeId);
      if (existingActive) {
        throw new ConflictError(
          'Khuôn mặt đã được đăng ký trước đó. Vui lòng cập nhật hoặc xóa trước.',
          'FACE_ALREADY_REGISTERED'
        );
      }

      const profile = await faceProfileRepository.createFaceProfile({
        employeeId,
        embedding: embeddings,
        embeddingVersion: 'face-api-v1-client-webgl',
        provider: 'face-api-client'
      });

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: 'FACE_PROFILE_REGISTERED_BY_ADMIN',
        description: `Admin đăng ký khuôn mặt eKYC thành công cho nhân viên ID ${employeeId} (Lưu ${embeddings.length} mẫu WebGL)`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      return res.status(201).json({
        success: true,
        message: 'Đăng ký khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          status: profile.status,
          registeredAt: profile.registeredAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ADMIN: Update face profile using client-computed multi-embeddings for a specific employee
   */
  async updateEmbeddingAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền cập nhật khuôn mặt cho nhân viên', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = parseInt(req.params.employeeId, 10);
      const { embeddings } = req.body;

      if (isNaN(employeeId)) {
        throw new BadRequestError('ID nhân viên không hợp lệ', ERROR_CODE.INVALID_INPUT);
      }

      if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
        throw new BadRequestError('Bộ embeddings cập nhật không hợp lệ', 'INVALID_EMBEDDING_SET');
      }

      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId);
      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ khuôn mặt để cập nhật', 'FACE_PROFILE_NOT_FOUND');
      }

      const profile = await faceProfileRepository.updateFaceProfile(activeProfile.faceProfileId, {
        embedding: embeddings,
        embeddingVersion: 'face-api-v1-client-webgl',
        provider: 'face-api-client'
      });

      await systemLogRepository.createLog({
        employeeId,
        accountId: req.auth.accountId,
        action: 'FACE_PROFILE_UPDATED_BY_ADMIN',
        description: `Admin cập nhật khuôn mặt eKYC thành công cho nhân viên ID ${employeeId} (Cập nhật ${embeddings.length} mẫu WebGL)`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      return res.status(200).json({
        success: true,
        message: 'Cập nhật khuôn mặt thành công',
        data: {
          faceProfileId: profile.faceProfileId,
          employeeId: profile.employeeId,
          provider: profile.provider,
          embeddingVersion: profile.embeddingVersion,
          updatedAt: profile.updatedAt
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/face/health — Health check API for AI models & memory state
   */
  async getHealthStatus(req, res, next) {
    try {
      const mediapipeStatus = require('../services/mediapipe.service').getHealthStatus();
      const tensorflowStatus = require('../services/tensorflow.service').getHealthStatus();

      const isReady = (mediapipeStatus.ready !== false) && (tensorflowStatus.ready !== false);

      return res.status(200).json({
        success: true,
        message: 'Trạng thái dịch vụ nhận diện khuôn mặt',
        data: {
          ready: isReady,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          mediapipe: mediapipeStatus,
          tensorflow: tensorflowStatus
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new FaceProfileController();
