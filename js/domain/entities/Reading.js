/**
 * Reading — Value Object
 * 
 * An immutable snapshot of a sensor measurement at a point in time.
 * This is the fundamental unit of data in the system.
 * 
 * Domain rules:
 * - Readings are immutable once created
 * - temp_f is required; humidity and battery are optional
 * - timestamp is always a Date object internally
 */
export class Reading {
  /** @param {{ sensorId: string, timestamp: Date, tempF: number, humidityPct?: number, batteryPct?: number }} params */
  constructor({ sensorId, timestamp, tempF, humidityPct = null, batteryPct = null }) {
    if (typeof tempF !== 'number' || Number.isNaN(tempF)) {
      throw new Error(`Reading requires numeric tempF, got: ${tempF}`);
    }
    Object.freeze(Object.assign(this, {
      sensorId,
      timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
      tempF,
      humidityPct,
      batteryPct,
    }));
  }

  /** Age in minutes relative to a reference time */
  ageMinutes(referenceTime = new Date()) {
    return (referenceTime - this.timestamp) / 60_000;
  }

  /** Is this reading stale? (default: older than 15 minutes) */
  isStale(thresholdMinutes = 15, referenceTime = new Date()) {
    return this.ageMinutes(referenceTime) > thresholdMinutes;
  }
}
