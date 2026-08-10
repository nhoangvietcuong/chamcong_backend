// Centralized Face AI Configuration
module.exports = {
  // Similarity threshold: similarity = 1 - euclidean_distance
  faceSimilarityThreshold: parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.86'),
  duplicateSimilarityThreshold: parseFloat(process.env.FACE_DUPLICATE_SIMILARITY_THRESHOLD || '0.85'),
  faceModel: process.env.FACE_MODEL || 'face-api',
  faceModelVersion: process.env.FACE_MODEL_VERSION || 'v1.2.0',
  faceMinSize: Math.min(parseInt(process.env.FACE_MIN_SIZE || '80', 10), 80), // Pixels (bounding box width)
  faceMaxCount: parseInt(process.env.FACE_MAX_COUNT || '1', 10),
  faceQualityThreshold: parseFloat(process.env.FACE_QUALITY_THRESHOLD || '0.50'),
  mediapipeModel: process.env.MEDIAPIPE_MODEL || 'ssd_mobilenetv1',
  mediapipeMaxFace: parseInt(process.env.MEDIAPIPE_MAX_FACE || '1', 10),
};
