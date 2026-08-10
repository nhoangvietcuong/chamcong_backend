const RISK_LEVEL = require('../constants/risk-level.constants');

/**
 * Calculates a location trust score (0 to 100) and risk level (LOW, MEDIUM, HIGH)
 * based on provided metrics.
 * Note: This score is a helper for auditing, not absolute proof.
 */
const calculateLocationRisk = (params) => {
  const {
    distanceMeter,
    allowedRadiusMeter,
    gpsAccuracy,
    isPwaStandalone,
    deviceFingerprintMatched = true,
  } = params;

  let trustScore = 100;

  // 1. Check distance against allowed radius
  if (distanceMeter > allowedRadiusMeter) {
    trustScore -= 50;
  }

  // 2. Check GPS accuracy
  if (gpsAccuracy > 15) {
    trustScore -= 30;
  }

  // 3. Check PWA standalone
  if (parseInt(isPwaStandalone, 10) === 0) {
    trustScore -= 20;
  }

  // 4. Check device fingerprint mismatch
  if (deviceFingerprintMatched === false) {
    trustScore -= 40;
  }

  // Enforce boundary [0, 100]
  if (trustScore < 0) trustScore = 0;
  if (trustScore > 100) trustScore = 100;

  // Risk level classification
  let riskLevel = RISK_LEVEL.LOW;
  if (trustScore < 50) {
    riskLevel = RISK_LEVEL.HIGH;
  } else if (trustScore < 80) {
    riskLevel = RISK_LEVEL.MEDIUM;
  }

  return {
    trustScore,
    riskLevel,
  };
};

module.exports = {
  calculateLocationRisk,
};
