/**
 * Interface contract for AI System Audit Logger
 */
class IAuditLogger {
  /**
   * Logs an AI security or transaction audit event.
   * @param {Object} logData - Log content
   * @param {Object} [dbClient] - DB transaction client
   * @returns {Promise<void>}
   */
  async log(logData, dbClient) {
    throw new Error('Method log() must be implemented.');
  }
}

module.exports = IAuditLogger;
