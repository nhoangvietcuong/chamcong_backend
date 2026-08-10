const assert = require('assert');
const { calculateDistanceMeters } = require('./haversine');

console.log('--- RUNNING HAVERSINE TESTS ---');

// Test Case 1: Same coordinates should yield 0 meters
try {
  const d = calculateDistanceMeters(10.762622, 106.660172, 10.762622, 106.660172);
  assert.strictEqual(d, 0);
  console.log('✔ Test Case 1: Same coordinates yield 0 distance - PASSED');
} catch (err) {
  console.error('❌ Test Case 1 failed:', err.message);
  process.exit(1);
}

// Test Case 2: Known coordinates (e.g. District 1 to District 3, HCMC, Vietnam)
// Coordinates: 10.762622, 106.660172 to 10.771234, 106.670456
// Distance using standard online calculator is ~ 1475 meters.
try {
  const d = calculateDistanceMeters(10.762622, 106.660172, 10.771234, 106.670456);
  console.log(`Computed distance: ${d.toFixed(2)} meters`);
  assert(d >= 1470 && d <= 1480, `Distance should be around 1475 meters, got ${d}`);
  console.log('✔ Test Case 2: HCMC District 1 to 3 distance - PASSED');
} catch (err) {
  console.error('❌ Test Case 2 failed:', err.message);
  process.exit(1);
}

// Test Case 3: Out of bounds latitude validation
try {
  calculateDistanceMeters(95.0, 106.660172, 10.762622, 106.660172);
  assert.fail('Should have thrown out of bounds latitude error');
} catch (err) {
  if (err.errorCode === 'INVALID_LATITUDE') {
    console.log('✔ Test Case 3: OOB Latitude error caught - PASSED');
  } else {
    console.error('❌ Test Case 3 failed:', err.message);
    process.exit(1);
  }
}

// Test Case 4: Out of bounds longitude validation
try {
  calculateDistanceMeters(10.762622, 185.0, 10.762622, 106.660172);
  assert.fail('Should have thrown out of bounds longitude error');
} catch (err) {
  if (err.errorCode === 'INVALID_LONGITUDE') {
    console.log('✔ Test Case 4: OOB Longitude error caught - PASSED');
  } else {
    console.error('❌ Test Case 4 failed:', err.message);
    process.exit(1);
  }
}

// Test Case 5: Non-numeric values validation
try {
  calculateDistanceMeters('abc', 106.660172, 10.762622, 106.660172);
  assert.fail('Should have thrown invalid type error');
} catch (err) {
  if (err.errorCode === 'INVALID_LATITUDE') {
    console.log('✔ Test Case 5: Non-numeric coordinate error caught - PASSED');
  } else {
    console.error('❌ Test Case 5 failed:', err.message);
    process.exit(1);
  }
}

console.log('✔ ALL HAVERSINE TESTS PASSED SUCCESSFULLY!');
