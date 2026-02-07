/**
 * Zone — Aggregate Root
 * 
 * An HVAC zone containing 0 to N sensors. This is the primary unit
 * of thermal analysis. Zones know how to aggregate their sensors'
 * readings into a single representative temperature.
 * 
 * Domain rules:
 * - A zone with 0 sensors is "uncovered" (valid but no data)
 * - A zone with 1 sensor uses that sensor's reading directly
 * - A zone with N>1 sensors averages them and tracks spread
 * - Adjacency relationships are declared, not inferred
 */
export class Zone {
  /**
   * @param {{
   *   zoneId: string,
   *   name: string,
   *   hvacZone?: string,
   *   adjacentZoneIds?: string[],
   *   svgLayout?: object
   * }} params
   */
  constructor({ zoneId, name, hvacZone = null, adjacentZoneIds = [], svgLayout = null }) {
    this.zoneId = zoneId;
    this.name = name;
    this.hvacZone = hvacZone;          // e.g. "boys_rooms", "master", "downstairs"
    this.adjacentZoneIds = adjacentZoneIds;
    this.svgLayout = svgLayout;        // Presentation hint — renderers use this
    /** @type {import('./Sensor.js').Sensor[]} */
    this._sensors = [];
  }

  // ── Sensor management ──────────────────────────────

  addSensor(sensor) {
    if (!this._sensors.find(s => s.sensorId === sensor.sensorId)) {
      this._sensors.push(sensor);
    }
  }

  removeSensor(sensorId) {
    this._sensors = this._sensors.filter(s => s.sensorId !== sensorId);
  }

  get sensors() {
    return [...this._sensors];
  }

  get sensorCount() {
    return this._sensors.length;
  }

  // ── Coverage status ────────────────────────────────

  /** @returns {'covered'|'partial'|'uncovered'} */
  get coverageStatus() {
    if (this._sensors.length === 0) return 'uncovered';
    const online = this._sensors.filter(s => s.status === 'online').length;
    if (online === 0) return 'uncovered';
    if (online < this._sensors.length) return 'partial';
    return 'covered';
  }

  get onlineSensors() {
    return this._sensors.filter(s => s.status !== 'offline');
  }

  // ── Temperature aggregation ────────────────────────

  /** Representative temperature for this zone (averaged across online sensors) */
  get currentTempF() {
    const temps = this._sensors.map(s => s.currentTempF).filter(t => t !== null);
    if (temps.length === 0) return null;
    return temps.reduce((sum, t) => sum + t, 0) / temps.length;
  }

  /** Min temp across sensors (useful for multi-sensor zones) */
  get minTempF() {
    const temps = this._sensors.map(s => s.currentTempF).filter(t => t !== null);
    return temps.length > 0 ? Math.min(...temps) : null;
  }

  /** Max temp across sensors */
  get maxTempF() {
    const temps = this._sensors.map(s => s.currentTempF).filter(t => t !== null);
    return temps.length > 0 ? Math.max(...temps) : null;
  }

  /** Spread between sensors (indicator of zone uniformity) */
  get tempSpreadF() {
    const min = this.minTempF;
    const max = this.maxTempF;
    if (min === null || max === null) return null;
    return max - min;
  }

  /** Current humidity (averaged) */
  get currentHumidity() {
    const vals = this._sensors.map(s => s.currentHumidity).filter(v => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }

  // ── Time-series (aggregated across sensors) ────────

  /**
   * Returns a merged, time-aligned series for the zone.
   * Each point is { timestamp, tempF, sensorCount }.
   * When multiple sensors have readings at overlapping times,
   * they are bucketed into intervals and averaged.
   * 
   * @param {number} hours — window size
   * @param {number} bucketMinutes — aggregation bucket (default 5, matching polling interval)
   */
  getTimeSeries(hours, bucketMinutes = 5, referenceTime = new Date()) {
    const allReadings = this._sensors.flatMap(s => s.readingsInWindow(hours, referenceTime));
    if (allReadings.length === 0) return [];

    // Bucket readings by time interval
    const bucketMs = bucketMinutes * 60_000;
    /** @type {Map<number, { temps: number[], timestamp: Date }>} */
    const buckets = new Map();

    for (const r of allReadings) {
      const key = Math.floor(r.timestamp.getTime() / bucketMs) * bucketMs;
      if (!buckets.has(key)) {
        buckets.set(key, { temps: [], timestamp: new Date(key + bucketMs / 2) });
      }
      buckets.get(key).temps.push(r.tempF);
    }

    // Average each bucket, sort by time
    return Array.from(buckets.values())
      .map(b => ({
        timestamp: b.timestamp,
        tempF: b.temps.reduce((s, t) => s + t, 0) / b.temps.length,
        sensorCount: b.temps.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
