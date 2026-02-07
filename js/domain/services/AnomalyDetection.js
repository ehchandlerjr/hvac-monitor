/**
 * AnomalyDetectionService — Domain Service
 * 
 * Evaluates zone conditions against safety thresholds and patterns.
 * Returns structured anomaly objects — presentation decides how to display them.
 * 
 * Anomaly levels:
 * - 'info'    — notable but not concerning (e.g., sensor came back online)
 * - 'warning' — needs attention soon (e.g., temp drifting outside comfort range)
 * - 'danger'  — immediate concern (e.g., nursery below safe sleeping temp)
 */

/** @typedef {'info'|'warning'|'danger'} AnomalyLevel */
/** @typedef {{ level: AnomalyLevel, zoneId: string, code: string, message: string, value?: number }} Anomaly */

/** Default thresholds — can be overridden per zone */
const DEFAULT_THRESHOLDS = {
  comfortLowF: 65,
  comfortHighF: 78,
  dangerLowF: 60,
  dangerHighF: 85,
  maxRatePerHour: 3.0,      // °F/hr — faster than this is suspicious
  maxZoneDeltaF: 5.0,       // same HVAC zone shouldn't differ by more than this
  maxWholeHouseSpreadF: 8.0,
  staleSensorMinutes: 15,
};

/**
 * Run all anomaly checks against current zone state.
 * 
 * @param {import('../entities/Zone.js').Zone[]} zones
 * @param {import('../entities/WeatherSnapshot.js').WeatherSnapshot | null} weather
 * @param {Map<string, { ratePerHour: number }>} rateOfChangeMap - zoneId → rate data
 * @param {object} thresholdOverrides
 * @returns {Anomaly[]}
 */
export function detectAnomalies(zones, weather, rateOfChangeMap = new Map(), thresholdOverrides = {}) {
  const T = { ...DEFAULT_THRESHOLDS, ...thresholdOverrides };
  /** @type {Anomaly[]} */
  const anomalies = [];

  for (const zone of zones) {
    const temp = zone.currentTempF;

    // ── Temperature range checks ─────────────────
    if (temp !== null) {
      if (temp < T.dangerLowF) {
        anomalies.push({
          level: 'danger', zoneId: zone.zoneId, code: 'TEMP_DANGER_LOW',
          message: `${zone.name} is ${temp.toFixed(1)}°F — dangerously cold`,
          value: temp,
        });
      } else if (temp < T.comfortLowF) {
        anomalies.push({
          level: 'warning', zoneId: zone.zoneId, code: 'TEMP_LOW',
          message: `${zone.name} is ${temp.toFixed(1)}°F — below comfort range`,
          value: temp,
        });
      } else if (temp > T.dangerHighF) {
        anomalies.push({
          level: 'danger', zoneId: zone.zoneId, code: 'TEMP_DANGER_HIGH',
          message: `${zone.name} is ${temp.toFixed(1)}°F — dangerously hot`,
          value: temp,
        });
      } else if (temp > T.comfortHighF) {
        anomalies.push({
          level: 'warning', zoneId: zone.zoneId, code: 'TEMP_HIGH',
          message: `${zone.name} is ${temp.toFixed(1)}°F — above comfort range`,
          value: temp,
        });
      }
    }

    // ── Rate of change check ─────────────────────
    const rate = rateOfChangeMap.get(zone.zoneId);
    if (rate && Math.abs(rate.ratePerHour) > T.maxRatePerHour) {
      const dir = rate.ratePerHour > 0 ? 'rising' : 'falling';
      anomalies.push({
        level: 'warning', zoneId: zone.zoneId, code: 'RAPID_CHANGE',
        message: `${zone.name} is ${dir} at ${Math.abs(rate.ratePerHour).toFixed(1)}°F/hr`,
        value: rate.ratePerHour,
      });
    }

    // ── Sensor coverage checks ───────────────────
    if (zone.sensorCount > 0 && zone.coverageStatus === 'uncovered') {
      anomalies.push({
        level: 'warning', zoneId: zone.zoneId, code: 'ALL_SENSORS_OFFLINE',
        message: `${zone.name} — all ${zone.sensorCount} sensor(s) offline`,
      });
    } else if (zone.coverageStatus === 'partial') {
      const offline = zone.sensors.filter(s => s.status === 'offline').length;
      anomalies.push({
        level: 'info', zoneId: zone.zoneId, code: 'PARTIAL_COVERAGE',
        message: `${zone.name} — ${offline} of ${zone.sensorCount} sensor(s) offline`,
      });
    }

    // ── Intra-zone spread (multi-sensor zones) ───
    const spread = zone.tempSpreadF;
    if (spread !== null && spread > T.maxZoneDeltaF) {
      anomalies.push({
        level: 'warning', zoneId: zone.zoneId, code: 'INTRA_ZONE_SPREAD',
        message: `${zone.name} has ${spread.toFixed(1)}°F spread between sensors`,
        value: spread,
      });
    }

    // ── Battery checks ───────────────────────────
    for (const sensor of zone.sensors) {
      if (sensor.currentBattery !== null && sensor.currentBattery < 20) {
        anomalies.push({
          level: sensor.currentBattery < 10 ? 'warning' : 'info',
          zoneId: zone.zoneId, code: 'LOW_BATTERY',
          message: `${sensor.label} battery at ${sensor.currentBattery}%`,
          value: sensor.currentBattery,
        });
      }
    }
  }

  // ── Whole-house spread ─────────────────────────
  const temps = zones.map(z => z.currentTempF).filter(t => t !== null);
  if (temps.length >= 2) {
    const wholeSpread = Math.max(...temps) - Math.min(...temps);
    if (wholeSpread > T.maxWholeHouseSpreadF) {
      anomalies.push({
        level: 'warning', zoneId: '__house__', code: 'HOUSE_SPREAD',
        message: `Whole-house spread is ${wholeSpread.toFixed(1)}°F`,
        value: wholeSpread,
      });
    }
  }

  return anomalies;
}

/**
 * Filter anomalies by minimum severity level.
 * @param {Anomaly[]} anomalies
 * @param {AnomalyLevel} minLevel
 */
export function filterByLevel(anomalies, minLevel) {
  const rank = { info: 0, warning: 1, danger: 2 };
  const min = rank[minLevel] || 0;
  return anomalies.filter(a => rank[a.level] >= min);
}

/**
 * Get the worst anomaly level present.
 * @param {Anomaly[]} anomalies
 * @returns {AnomalyLevel | 'ok'}
 */
export function worstLevel(anomalies) {
  if (anomalies.some(a => a.level === 'danger')) return 'danger';
  if (anomalies.some(a => a.level === 'warning')) return 'warning';
  if (anomalies.some(a => a.level === 'info')) return 'info';
  return 'ok';
}
