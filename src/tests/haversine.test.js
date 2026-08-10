const { calculateDistanceMeters } = require('../utils/haversine');

describe('Haversine Formula GPS Distance Calculation Unit Tests', () => {
  test('Same Coordinate - should return exactly 0 meters', () => {
    const d = calculateDistanceMeters(10.762622, 106.660172, 10.762622, 106.660172);
    expect(d).toBe(0);
  });

  test('Known Distance - District 1 to District 3, HCMC (approx 1475m)', () => {
    const d = calculateDistanceMeters(10.762622, 106.660172, 10.771234, 106.670456);
    expect(d).toBeGreaterThanOrEqual(1470);
    expect(d).toBeLessThanOrEqual(1480);
  });

  test('Negative Coordinate - Southern/Western Hemisphere coordinates', () => {
    // Sydney (approx -33.8688, 151.2093) to Melbourne (approx -37.8136, 144.9631)
    // Distance is approx 713 km = 713000m
    const d = calculateDistanceMeters(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(d).toBeGreaterThanOrEqual(700000);
    expect(d).toBeLessThanOrEqual(730000);
  });

  test('Boundary Latitude - maximum edge lat = 90 / -90', () => {
    const d = calculateDistanceMeters(90, 0, -90, 0);
    // Distance from North to South pole along longitude 0 is approx 20015 km = 20015000m
    expect(d).toBeGreaterThan(20000000);
  });

  test('Boundary Longitude - maximum edge lon = 180 / -180', () => {
    const d = calculateDistanceMeters(0, 180, 0, -180);
    // Same physical longitude, should be 0 or near 0
    expect(d).toBeLessThan(0.001);
  });

  test('Invalid Input - latitude or longitude out of bounds should throw BadRequestError', () => {
    expect(() => calculateDistanceMeters(95.0, 106.660172, 10.762622, 106.660172)).toThrow();
    expect(() => calculateDistanceMeters(10.762622, 185.0, 10.762622, 106.660172)).toThrow();
  });

  test('Invalid Input - non-numeric coordinates should throw error', () => {
    expect(() => calculateDistanceMeters('abc', 106.660172, 10.762622, 106.660172)).toThrow();
  });

  test('Return Meter - verify units of returned value is meter', () => {
    // Moving ~ 0.001 degree of latitude is approx 111 meters
    const d = calculateDistanceMeters(10.0, 106.0, 10.001, 106.0);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  test('Precision - verify unrounded double precision distance is returned', () => {
    const d = calculateDistanceMeters(10.762622, 106.660172, 10.771234, 106.670456);
    expect(d % 1 !== 0).toBe(true); // Should be a decimal float, not an integer
  });
});
