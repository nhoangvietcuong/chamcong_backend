/**
 * Comprehensive 7-Case Face Security & Reliability Integration Test Suite
 */
const assert = require('assert');
const tensorflowService = require('../services/tensorflow.service');
const identityVerificationService = require('../services/identity-verification.service');
const mediapipeService = require('../services/mediapipe.service');
const config = require('../config/face-ai-config');

// Base 128D descriptor vector for Employee A
const vectorEmployeeA = Array.from({ length: 128 }, (_, i) => 0.1 + (i % 5) * 0.02);

// Descriptor vector for Employee B
const vectorEmployeeB = Array.from({ length: 128 }, (_, i) => -0.4 + (i % 3) * 0.05);

const profileEmployeeA = {
  faceProfileId: 101,
  employeeId: 1,
  embedding: vectorEmployeeA,
  status: 1
};

async function runFullFaceSecuritySuite() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING COMPREHENSIVE 7-CASE FACE INTEGRATION TESTS');
  console.log('==================================================\n');

  let passedCount = 0;
  const totalCount = 7;

  // CASE 1: Đăng ký A -> Check-in A => PASS
  try {
    const variantA = vectorEmployeeA.map(v => v + (Math.random() - 0.5) * 0.02); // ~0.25 distance, ~0.75 similarity
    const sim = tensorflowService.calculateSimilarity(variantA, profileEmployeeA.embedding);
    assert.strictEqual(sim >= config.faceSimilarityThreshold, true, 'Case 1 should pass threshold');
    console.log(`✅ CASE 1 PASSED: Register A -> Check-in A => PASS (Similarity: ${sim.toFixed(4)} >= ${config.faceSimilarityThreshold})`);
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 1 FAILED:', err.message);
  }

  // CASE 2: Đăng ký A -> Check-in B => FAIL
  try {
    const sim = tensorflowService.calculateSimilarity(vectorEmployeeB, profileEmployeeA.embedding);
    assert.strictEqual(sim < config.faceSimilarityThreshold, true, 'Case 2 should fail threshold');
    console.log(`✅ CASE 2 PASSED: Register A -> Check-in B => FAIL (Similarity: ${sim.toFixed(4)} < ${config.faceSimilarityThreshold})`);
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 2 FAILED:', err.message);
  }

  // CASE 3: Đăng ký A -> Check-in A (10 lần) => PASS >= 95%
  try {
    let successRuns = 0;
    for (let i = 0; i < 10; i++) {
      const variant = vectorEmployeeA.map(v => v + (Math.random() - 0.5) * 0.03);
      const sim = tensorflowService.calculateSimilarity(variant, profileEmployeeA.embedding);
      if (sim >= config.faceSimilarityThreshold) successRuns++;
    }
    const accuracy = (successRuns / 10) * 100;
    assert.strictEqual(accuracy >= 95, true, 'Case 3 accuracy should be >= 95%');
    console.log(`✅ CASE 3 PASSED: Register A -> Check-in A (10 runs) => PASS ${accuracy}% (Target >= 95%)`);
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 3 FAILED:', err.message);
  }

  // CASE 4: Đăng ký A -> Ảnh quá tối / chất lượng kém => FAIL (Rejection / Quality check)
  try {
    let errorThrown = null;
    try {
      identityVerificationService.validateDetectionQuality({
        detected: true,
        quality: 0.20, // below quality threshold 0.50
        reason: 'LOW_FACE_QUALITY'
      });
    } catch (err) {
      errorThrown = err;
    }
    assert.notStrictEqual(errorThrown, null, 'Case 4 should reject low quality image');
    console.log('✅ CASE 4 PASSED: Low quality / dark image => REJECTED (Chất lượng không đạt)');
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 4 FAILED:', err.message);
  }

  // CASE 5: Đăng ký A -> Đeo khẩu trang / bị che => FAIL (Occlusion detected)
  try {
    const checkResult = mediapipeService.detectOcclusion({
      landmarks: Array(468).fill({ x: 0.5, y: 0.5, z: 0 })
    }, 'mock_occlusion_detected');
    assert.strictEqual(checkResult.passed, false, 'Case 5 should detect occlusion');
    console.log('✅ CASE 5 PASSED: Mask / Occlusion => REJECTED (Phát hiện bị che phủ)');
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 5 FAILED:', err.message);
  }

  // CASE 6: Đăng ký A -> Ảnh in / Giả mạo (Liveness spoof fail) => FAIL
  try {
    const livenessRes = await mediapipeService.evaluateLiveness([], 'mock_spoof_detected');
    assert.strictEqual(livenessRes.passed, false, 'Case 6 should fail liveness for photo spoof');
    console.log('✅ CASE 6 PASSED: Printed Photo / Spoof => REJECTED (Liveness Failed)');
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 6 FAILED:', err.message);
  }

  // CASE 7: Employee chưa đăng ký => FAIL (FACE_PROFILE_NOT_FOUND)
  try {
    let errRes = null;
    try {
      await identityVerificationService.verifyIdentity(888888, Buffer.from('dummy'), 'test.jpg', null);
    } catch (err) {
      errRes = err;
    }
    assert.notStrictEqual(errRes, null, 'Case 7 should throw FACE_PROFILE_NOT_FOUND');
    assert.strictEqual(errRes.errorCode, 'FACE_PROFILE_NOT_FOUND');
    console.log('✅ CASE 7 PASSED: Unregistered Employee => FAIL (Error: FACE_PROFILE_NOT_FOUND)');
    passedCount++;
  } catch (err) {
    console.error('❌ CASE 7 FAILED:', err.message);
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} PASSED`);
  console.log('==================================================\n');
}

if (require.main === module) {
  runFullFaceSecuritySuite();
}

module.exports = { runFullFaceSecuritySuite };
