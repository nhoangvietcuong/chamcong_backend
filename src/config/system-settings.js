const faceAiConfig = require('../modules/face-recognition/config/face-ai-config');

let systemSettingsInMemory = {
  defaultAllowedRadius: 100,
  geofenceBufferMeter: 20,
  gpsMaxAccuracy: 30,
  maxPhotoSizeMb: 5,
  acceptedPhotoFormats: "image/jpeg, image/png",
  similarityThreshold: faceAiConfig.faceSimilarityThreshold,
  tfModelVersion: "MediaPipe FaceMesh v1.0",
  embeddingVersion: "MobileNetV2-128",
  faceTimeoutSec: 15,
  challengeTimeoutMs: 60000,
  residentKey: "required",
  userVerification: "required",
  authenticatorAttachment: "platform",
  syncRetryIntervalMin: 5,
  syncMaxRetries: 5,
  syncQueueSize: 50,
  syncAutoOnNetwork: "true",
  cloudinaryCloudName: "time-tracking-cloudinary",
  cloudinaryFolder: "attendance_photos",
  cloudinaryPreset: "preset_time_tracking",
  cloudinaryMaxSizeMb: 10,
  ntpServerUrl: "pool.ntp.org",
  systemTimezone: "Asia/Ho_Chi_Minh",
  accessTokenLifetimeSec: 900,
  refreshTokenLifetimeDays: 7,
  maxDevicesPerUser: 3,
  sessionExpirationMin: 1440,
  auditRetentionDays: 90,
  exportExcelAllowed: "true",
  companyStartTime: "08:00:00",
  companyEndTime: "17:00:00",
  companyLateGraceMinutes: 5,
  companyEarlyLeaveGraceMinutes: 5,
  
  // Global Leave Settings
  defaultAnnualLeaveDays: 12,
  defaultSickLeaveDays: 10,
  defaultMarriageLeaveDays: 3,
  defaultMaternityLeaveDays: 180,
  defaultOtherLeaveDays: 5,
  offlineSubmissionDeadline: process.env.OFFLINE_SUBMISSION_DEADLINE || "22:00"
};

module.exports = systemSettingsInMemory;
