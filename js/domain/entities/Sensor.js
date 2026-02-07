/**
 * Sensor — Entity
 * 
 * A physical temperature sensor. Maintains an ordered history of readings.
 * Sensors belong to exactly one Zone (or none, if unassigned).
 * 
 * Domain rules:
 * - Readings are kept sorted by timestamp (newest last)
 * - The "current" reading is the most recent non-stale reading
 * - A sensor with no readings or only stale readings reports status "offline"
 */
export class Sensor {
  /**
   * @param {{ sensorId: string, label?: string, deviceId?: string }} params
   */
  constructor({ sensorId, label = null, deviceId = null }) {
    this.sensorId = sensorId;
    this.label = label || sensorId;
    this.deviceId = deviceId;
    /** @type {import('./Reading.js').Reading[]} */
    this._readings = [];
  }

  /** Append readings (bulk), re-sort, deduplicate by timestamp */
  ingestReadings(readings) {
    for (const r of readings) {
      if (r.sensorId !== this.sensorId) continue;
      this._readings.push(r);
    }
    // Sort ascending by timestamp
    this._readings.sort((a, b) => a.timestamp - b.timestamp);
    // Deduplicate (same timestamp within 1 second)
    this._readings = this._readings.filter((r, i, arr) =>
      i === 0 || Math.abs(r.timestamp - arr[i - 1].timestamp) > 1000
    );
  }

  /** All readings within the last N hours */
  readingsInWindow(hours, referenceTime = new Date()) {
    const cutoff = new Date(referenceTime - hours * 3_600_000);
    return this._readings.filter(r => r.timestamp >= cutoff);
  }

  /** Most recent reading, or null */
  get latestReading() {
    return this._readings.length > 0
      ? this._readings[this._readings.length - 1]
      : null;
  }

  /** Current temperature, or null if no data / stale */
  get currentTempF() {
    const r = this.latestReading;
    return r && !r.isStale() ? r.tempF : null;
  }

  /** Current humidity, or null */
  get currentHumidity() {
    const r = this.latestReading;
    return r && !r.isStale() ? r.humidityPct : null;
  }

  /** Current battery, or null */
  get currentBattery() {
    const r = this.latestReading;
    return r && !r.isStale() ? r.batteryPct : null;
  }

  /** @returns {'online'|'stale'|'offline'} */
  get status() {
    const r = this.latestReading;
    if (!r) return 'offline';
    if (r.isStale(15)) return 'stale';
    return 'online';
  }

  /** Total number of readings in history */
  get readingCount() {
    return this._readings.length;
  }

  /** Clear all readings (for refresh) */
  clearReadings() {
    this._readings = [];
  }
}
