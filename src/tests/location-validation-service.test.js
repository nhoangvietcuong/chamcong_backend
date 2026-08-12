const locationValidationService = require('../services/location-validation-service');
const haversine = require('../utils/haversine');
const locationRisk = require('../utils/location-risk');

jest.mock('../utils/haversine', () => ({
  calculateDistanceMeters: jest.fn(),
}));

jest.mock('../utils/location-risk', () => ({
  calculateLocationRisk: jest.fn(),
}));

describe('LocationValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseParams = {
    employeeLatitude: 10,
    employeeLongitude: 10,
    targetLatitude: 10,
    targetLongitude: 10,
    gpsAccuracy: 10,
    isPwaStandalone: 1,
    deviceFingerprintMatched: true,
  };

  describe('Buffer = 20m, Radius = 100m', () => {
    const params = {
      ...baseParams,
      allowedRadiusMeter: 100,
      geofenceBufferMeter: 20,
    };

    it('should be valid (isInsideRadius = true) for distance 100m', () => {
      haversine.calculateDistanceMeters.mockReturnValue(100);
      locationRisk.calculateLocationRisk.mockReturnValue({ trustScore: 100, riskLevel: 'LOW' });

      const result = locationValidationService.validateLocation(params);

      expect(result.distanceMeter).toBe(100);
      expect(result.isInsideRadius).toBe(true);
      expect(result.isInsideBuffer).toBe(true);
      expect(result.riskLevel).toBe('LOW'); // Preserves original risk level
    });

    it('should be valid buffer (isInsideBuffer = true, isInsideRadius = false) for distance 120m', () => {
      haversine.calculateDistanceMeters.mockReturnValue(120);
      locationRisk.calculateLocationRisk.mockReturnValue({ trustScore: 100, riskLevel: 'LOW' });

      const result = locationValidationService.validateLocation(params);

      expect(result.distanceMeter).toBe(120);
      expect(result.isInsideRadius).toBe(false);
      expect(result.isInsideBuffer).toBe(true);
      expect(result.riskLevel).toBe('GEOFENCE_BUFFER'); // Overrides risk level
    });

    it('should be invalid (isInsideBuffer = false) for distance 120.1m', () => {
      haversine.calculateDistanceMeters.mockReturnValue(120.1);
      locationRisk.calculateLocationRisk.mockReturnValue({ trustScore: 100, riskLevel: 'LOW' });

      const result = locationValidationService.validateLocation(params);

      expect(result.distanceMeter).toBe(120.1);
      expect(result.isInsideRadius).toBe(false);
      expect(result.isInsideBuffer).toBe(false);
      expect(result.riskLevel).toBe('LOW'); // Preserves original risk level from assess audits
    });
  });

  describe('Buffer = 0m, Radius = 100m (Strict Boundary Check)', () => {
    const params = {
      ...baseParams,
      allowedRadiusMeter: 100,
      geofenceBufferMeter: 0,
    };

    it('should be valid (isInsideRadius = true) for distance 100m', () => {
      haversine.calculateDistanceMeters.mockReturnValue(100);
      locationRisk.calculateLocationRisk.mockReturnValue({ trustScore: 100, riskLevel: 'LOW' });

      const result = locationValidationService.validateLocation(params);

      expect(result.distanceMeter).toBe(100);
      expect(result.isInsideRadius).toBe(true);
      expect(result.isInsideBuffer).toBe(true);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should be invalid (isInsideRadius = false, isInsideBuffer = false) for distance 100.1m', () => {
      haversine.calculateDistanceMeters.mockReturnValue(100.1);
      locationRisk.calculateLocationRisk.mockReturnValue({ trustScore: 100, riskLevel: 'LOW' });

      const result = locationValidationService.validateLocation(params);

      expect(result.distanceMeter).toBe(100.1);
      expect(result.isInsideRadius).toBe(false);
      expect(result.isInsideBuffer).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
  });
});
