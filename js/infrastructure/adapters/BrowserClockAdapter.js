/**
 * BrowserClockAdapter — Infrastructure Adapter
 * 
 * Implements ClockPort using the browser's Date and setInterval.
 * Swap this for a deterministic clock in tests.
 */

import { ClockPort } from '../../application/ports/ClockPort.js';

export class BrowserClockAdapter extends ClockPort {
  now() {
    return new Date();
  }

  scheduleInterval(callback, intervalMs) {
    return setInterval(callback, intervalMs);
  }

  cancelInterval(handle) {
    clearInterval(handle);
  }
}
