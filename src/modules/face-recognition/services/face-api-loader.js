/**
 * Singleton loader for @vladmandic/face-api models.
 * Loads TensorFlow.js + face-api models once and caches them.
 * All face recognition services share this single instance.
 */
const path = require('path');
const logger = require('../../../utils/logger');

const MODELS_PATH = path.join(__dirname, '../models');

let _faceapi = null;
let _tf = null;
let initialized = false;
let initPromise = null;

/**
 * Load models if not yet initialized. Subsequent calls return immediately.
 * @returns {{ faceapi, tf }}
 */
async function loadModels() {
  if (initialized) return { faceapi: _faceapi, tf: _tf };
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      logger.info('🤖 Initializing TensorFlow.js backend...');
      try {
        _tf = require('@tensorflow/tfjs-node');
        await _tf.ready();
        logger.info('   ✅ TensorFlow.js ready (backend: ' + _tf.getBackend() + ')');
        _faceapi = require('@vladmandic/face-api');
      } catch (nodeErr) {
        logger.warn('⚠️  @tensorflow/tfjs-node is not installed or failed to load. Falling back to WebAssembly backend (slower than native, but compiler-free)...');
        try {
          _tf = require('@tensorflow/tfjs');
          const wasm = require('@tensorflow/tfjs-backend-wasm');
          
          // Configure local WASM paths
          const wasmDir = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json'));
          const wasmPath = path.join(wasmDir, 'dist').replace(/\\/g, '/') + '/';
          wasm.setWasmPaths(wasmPath);

          await _tf.setBackend('wasm');
          await _tf.ready();
          logger.info('   ✅ TensorFlow.js ready (backend: ' + _tf.getBackend() + ')');
          
          _faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
        } catch (wasmErr) {
          logger.warn('⚠️  WebAssembly backend initialization failed: ' + wasmErr.message + '. Falling back to CPU backend.');
          _tf = require('@tensorflow/tfjs');
          await _tf.setBackend('cpu');
          await _tf.ready();
          logger.info('   ✅ TensorFlow.js ready (backend: ' + _tf.getBackend() + ')');
          _faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
        }
      }

      logger.info('   ⏳ Loading SSD MobileNetV1 (face detection)...');
      await _faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);

      logger.info('   ⏳ Loading FaceLandmark68Net...');
      await _faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);

      logger.info('   ⏳ Loading FaceRecognitionNet (128D embedding)...');
      await _faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

      initialized = true;
      logger.info('✅ Face recognition AI models loaded and ready');

      return { faceapi: _faceapi, tf: _tf };
    } catch (err) {
      initPromise = null; // Allow retry on failure
      logger.error(`❌ Failed to load face recognition models: ${err.message}`);
      throw err;
    }
  })();

  return initPromise;
}

module.exports = { loadModels };
