const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Generates a safe, random filename with the same extension as the original file.
 * Protects against name collisions and path traversal.
 */
const generateSafeFileName = (originalName) => {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeExt = ['.jpeg', '.jpg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  return `${uuidv4()}${safeExt}`;
};

module.exports = {
  generateSafeFileName,
};
