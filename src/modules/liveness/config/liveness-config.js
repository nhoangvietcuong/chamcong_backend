/**
 * Liveness Configuration class.
 * Reads environment variables and exposes parsed configurations.
 * Prevents reading process.env directly inside other files.
 */
class LivenessConfig {
  constructor() {
    this.livenessThreshold = parseFloat(process.env.LIVENESS_THRESHOLD || '0.90');
    this.headPoseThreshold = parseFloat(process.env.HEAD_POSE_THRESHOLD || '20');
    this.maxFaceCount = parseInt(process.env.MAX_FACE_COUNT || '1', 10);
    this.faceQualityThreshold = parseFloat(process.env.FACE_QUALITY_THRESHOLD || '0.75');
    this.enableEyeBlink = process.env.ENABLE_EYE_BLINK !== 'false';
    this.enableHeadPose = process.env.ENABLE_HEAD_POSE !== 'false';
    this.enableSpoofDetection = process.env.ENABLE_SPOOF_DETECTION !== 'false';
  }
}

module.exports = new LivenessConfig();
