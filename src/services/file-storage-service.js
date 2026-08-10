const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * File Storage Service providing abstraction layer over local disk storage.
 * Makes it easy to replace with S3, Cloudinary, etc., in future phases.
 */
class FileStorageService {
  /**
   * Generates public relative URL path for a stored file.
   * Do not return absolute local file paths to the client.
   */
  getFileUrl(filename) {
    if (!filename) return null;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads/attendance';
    // Normalizes to forward slashes for URLs
    const relativePath = path.join(uploadDir, filename).replace(/\\/g, '/');
    return `/${relativePath}`;
  }

  /**
   * Deletes a file from the local storage.
   * Essential for rollbacks to prevent leftover orphan files.
   */
  async deleteFile(fileUrlOrName) {
    if (!fileUrlOrName) return;

    let diskPath = fileUrlOrName;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads/attendance';

    // If it is just a filename, prepend the upload directory
    if (!fileUrlOrName.includes('/') && !fileUrlOrName.includes('\\')) {
      diskPath = path.join(uploadDir, fileUrlOrName);
    } else if (fileUrlOrName.startsWith('/')) {
      // If it's a relative URL, strip the leading slash
      diskPath = fileUrlOrName.substring(1);
    }

    try {
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
        logger.info(`Deleted orphan file: ${diskPath}`);
      }
    } catch (err) {
      logger.error(`Error deleting orphan file ${diskPath}: ${err.message}`, err);
    }
  }
}

module.exports = new FileStorageService();
