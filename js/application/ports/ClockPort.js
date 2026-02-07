/**
 * ClockPort — Application Port
 * 
 * Abstracts the system clock so domain logic can be tested
 * with deterministic time. Also provides interval scheduling.
 */
export class ClockPort {
  /** @returns {Date} */
  now() {
    throw new Error('ClockPort.now() must be implemented');
  }

  /**
   * Schedule a recurring callback.
   * @param {Function} callback
   * @param {number} intervalMs
   * @returns {*} handle to cancel
   */
  scheduleInterval(callback, intervalMs) {
    throw new Error('ClockPort.scheduleInterval() must be implemented');
  }

  /** Cancel a scheduled interval */
  cancelInterval(handle) {
    throw new Error('ClockPort.cancelInterval() must be implemented');
  }
}
