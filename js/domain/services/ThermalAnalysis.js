/**
 * ThermalAnalysisService — Domain Service
 * 
 * Pure calculation functions for thermal analysis.
 * No side effects, no I/O — just math.
 * 
 * Models:
 * - Rate of change (dT/dt) via linear regression on recent readings
 * - Newton's law of cooling for heat loss estimation
 * - RC thermal network for zone-to-zone heat transfer
 * - Zone uniformity scoring
 */

/**
 * Calculate rate of temperature change (°F/hr) using linear regression.
 * 
 * @param {{ timestamp: Date, tempF: number }[]} series - time-ordered readings
 * @param {number} windowMinutes - how far back to look (default 30)
 * @returns {{ ratePerHour: number, r2: number, direction: 'rising'|'falling'|'stable' } | null}
 */
export function calcRateOfChange(series, windowMinutes = 30) {
  if (series.length < 2) return null;

  const now = series[series.length - 1].timestamp;
  const cutoff = new Date(now - windowMinutes * 60_000);
  const window = series.filter(p => p.timestamp >= cutoff);

  if (window.length < 2) return null;

  // Linear regression: t (hours) vs tempF
  const t0 = window[0].timestamp.getTime();
  const xs = window.map(p => (p.timestamp.getTime() - t0) / 3_600_000); // hours
  const ys = window.map(p => p.tempF);
  const n = xs.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const sumY2 = ys.reduce((a, y) => a + y * y, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  // R² for confidence
  const ssRes = ys.reduce((a, y, i) => {
    const yHat = (sumY / n) + slope * (xs[i] - sumX / n);
    return a + (y - yHat) ** 2;
  }, 0);
  const ssTot = ys.reduce((a, y) => a + (y - sumY / n) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const STABLE_THRESHOLD = 0.3; // °F/hr — below this is "stable"

  return {
    ratePerHour: Math.round(slope * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
    direction: Math.abs(slope) < STABLE_THRESHOLD ? 'stable' : slope > 0 ? 'rising' : 'falling',
  };
}


/**
 * Newton's law of cooling: estimated heat loss rate.
 * 
 * Q = (T_indoor - T_outdoor) / R_total
 * 
 * Where R_total is the overall thermal resistance of the building envelope.
 * We don't know R_total precisely, but we can compare zones relatively.
 * 
 * @param {number} indoorTempF
 * @param {number} outdoorTempF
 * @param {number} thermalResistance - R-value in °F·hr/BTU (higher = better insulated)
 * @returns {number} Heat loss in BTU/hr (positive = losing heat, negative = gaining)
 */
export function estimateHeatLoss(indoorTempF, outdoorTempF, thermalResistance = 1.0) {
  if (thermalResistance <= 0) return 0;
  return (indoorTempF - outdoorTempF) / thermalResistance;
}


/**
 * RC thermal model: predict future temperature given current conditions.
 * 
 * dT/dt = (T_source - T_zone) / (R * C)
 * 
 * For HVAC: T_source is the supply air temp
 * For envelope: T_source is outdoor temp
 * 
 * @param {number} currentTempF - current zone temperature
 * @param {number} sourceTempF - driving temperature (supply air or outdoor)
 * @param {number} resistance - thermal resistance (°F·hr/BTU)
 * @param {number} capacitance - thermal capacitance (BTU/°F)
 * @param {number} dtHours - time step
 * @returns {number} predicted temperature after dt hours
 */
export function rcPredict(currentTempF, sourceTempF, resistance, capacitance, dtHours) {
  const tau = resistance * capacitance; // time constant
  if (tau <= 0) return sourceTempF;
  const decay = Math.exp(-dtHours / tau);
  return sourceTempF + (currentTempF - sourceTempF) * decay;
}


/**
 * Calculate ΔT between two zones.
 * Returns null if either zone has no data.
 * 
 * @param {import('../entities/Zone.js').Zone} zoneA
 * @param {import('../entities/Zone.js').Zone} zoneB
 * @returns {{ deltaF: number, abs: number, warmer: string } | null}
 */
export function calcZoneDelta(zoneA, zoneB) {
  const tA = zoneA.currentTempF;
  const tB = zoneB.currentTempF;
  if (tA === null || tB === null) return null;

  const delta = tA - tB;
  return {
    deltaF: Math.round(delta * 10) / 10,
    abs: Math.round(Math.abs(delta) * 10) / 10,
    warmer: delta > 0 ? zoneA.zoneId : delta < 0 ? zoneB.zoneId : 'equal',
  };
}


/**
 * Whole-house thermal spread: max temp minus min temp across all covered zones.
 * 
 * @param {import('../entities/Zone.js').Zone[]} zones
 * @returns {{ spreadF: number, coldest: string, warmest: string } | null}
 */
export function calcWholeHouseSpread(zones) {
  const covered = zones
    .filter(z => z.currentTempF !== null)
    .map(z => ({ id: z.zoneId, name: z.name, temp: z.currentTempF }));

  if (covered.length < 2) return null;

  covered.sort((a, b) => a.temp - b.temp);
  const coldest = covered[0];
  const warmest = covered[covered.length - 1];

  return {
    spreadF: Math.round((warmest.temp - coldest.temp) * 10) / 10,
    coldest: coldest.name,
    warmest: warmest.name,
  };
}


/**
 * Zone uniformity score: 0 (terrible) to 1 (perfect).
 * Based on standard deviation of zone temperatures relative to setpoint tolerance.
 * 
 * @param {import('../entities/Zone.js').Zone[]} zones
 * @param {number} toleranceF - acceptable deviation (default ±2°F)
 * @returns {number | null}
 */
export function calcUniformityScore(zones, toleranceF = 2.0) {
  const temps = zones.map(z => z.currentTempF).filter(t => t !== null);
  if (temps.length < 2) return null;

  const mean = temps.reduce((s, t) => s + t, 0) / temps.length;
  const variance = temps.reduce((s, t) => s + (t - mean) ** 2, 0) / temps.length;
  const stdDev = Math.sqrt(variance);

  // Score: 1 when stdDev = 0, decays toward 0 as stdDev approaches toleranceF
  return Math.max(0, Math.min(1, 1 - stdDev / toleranceF));
}
