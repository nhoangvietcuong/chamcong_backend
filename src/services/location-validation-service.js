const { calculateDistanceMeters } = require('../utils/haversine');
const { calculateLocationRisk } = require('../utils/location-risk');

/**
 * Service to perform location-based checks: calculating distance via Haversine,
 * checking allowed geofence bounds, and auditing trust scores/risk levels.
 */
class LocationValidationService {
  /**
   * Validates GPS location against target geofence bounds.
   * Returns distance, geofence compliance state, trust score, and risk level.
   */
  validateLocation(params) {
    const {
      employeeLatitude,
      employeeLongitude,
      targetLatitude,
      targetLongitude,
      allowedRadiusMeter,
      geofenceBufferMeter = 0,
      gpsAccuracy,
      isPwaStandalone,
      deviceFingerprintMatched,
    } = params;

    // 1. Calculate distance between coordinates
    const distanceMeter = calculateDistanceMeters(
      employeeLatitude,
      employeeLongitude,
      targetLatitude,
      targetLongitude
    );

    const radius = Number(allowedRadiusMeter);
    const buffer = Number(geofenceBufferMeter);
    const isInsideRadius = distanceMeter <= radius;
    const isInsideBuffer = distanceMeter <= (radius + buffer);

    // 2. Assess audits
    let { trustScore, riskLevel } = calculateLocationRisk({
      distanceMeter,
      allowedRadiusMeter,
      gpsAccuracy,
      isPwaStandalone,
      deviceFingerprintMatched,
    });

    if (!isInsideRadius && isInsideBuffer) {
      riskLevel = 'GEOFENCE_BUFFER';
    }

    return {
      distanceMeter,
      isInsideRadius,
      isInsideBuffer,
      trustScore,
      riskLevel,
    };
  }
}

module.exports = new LocationValidationService();
