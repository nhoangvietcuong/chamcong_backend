/**
 * Interface contract for Face Tracker
 */
class IFaceTracker {
  /**
   * Tracks a face over consecutive frames.
   * @param {Object} currentBox - Bounding box in the current frame
   * @param {Object} prevBox - Bounding box in the previous frame
   * @returns {Object} Updated/smoothed bounding box
   */
  track(currentBox, prevBox) {
    throw new Error('Method track() must be implemented.');
  }
}

module.exports = IFaceTracker;
