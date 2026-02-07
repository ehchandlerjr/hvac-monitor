/**
 * AnalyzeZones — Use Case
 * 
 * Runs the full thermal analysis pipeline on a DashboardSnapshot:
 * 1. Rate of change per zone
 * 2. Heat loss estimates (Newton's cooling)
 * 3. Zone-to-zone deltas (only adjacent zones)
 * 4. Whole-house spread & uniformity
 * 5. Anomaly detection
 * 
 * Returns an AnalysisResult that the presentation layer renders.
 */

import {
  calcRateOfChange,
  estimateHeatLoss,
  calcZoneDelta,
  calcWholeHouseSpread,
  calcUniformityScore,
} from '../../domain/services/ThermalAnalysis.js';

import { detectAnomalies, worstLevel } from '../../domain/services/AnomalyDetection.js';

/**
 * @typedef {Object} ZoneAnalysis
 * @property {string} zoneId
 * @property {{ ratePerHour: number, r2: number, direction: string }|null} rateOfChange
 * @property {number|null} heatLossBtuHr
 * @property {number|null} indoorOutdoorDeltaF
 */

/**
 * @typedef {Object} ZoneDeltaResult
 * @property {string} zoneAId
 * @property {string} zoneBId
 * @property {string} zoneAName
 * @property {string} zoneBName
 * @property {{ deltaF: number, abs: number, warmer: string }|null} delta
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {Map<string, ZoneAnalysis>} zoneAnalyses
 * @property {ZoneDeltaResult[]} deltas
 * @property {{ spreadF: number, coldest: string, warmest: string }|null} houseSpread
 * @property {number|null} uniformityScore
 * @property {import('../../domain/services/AnomalyDetection.js').Anomaly[]} anomalies
 * @property {'ok'|'info'|'warning'|'danger'} overallStatus
 */

/**
 * @param {{
 *   zones: import('../../domain/entities/Zone.js').Zone[],
 *   weather: import('../../domain/entities/WeatherSnapshot.js').WeatherSnapshot|null,
 *   thermalResistances?: Map<string, number>,
 * }} params
 * @returns {AnalysisResult}
 */
export function analyzeZones({ zones, weather, thermalResistances = new Map() }) {
  const DEFAULT_R = 1.0;

  // ── 1. Per-zone analysis ───────────────────────
  /** @type {Map<string, ZoneAnalysis>} */
  const zoneAnalyses = new Map();
  /** @type {Map<string, { ratePerHour: number }>} */
  const rateMap = new Map();

  for (const zone of zones) {
    const series = zone.getTimeSeries(1); // Last 1 hour for rate calc
    const rateOfChange = calcRateOfChange(series, 30);

    if (rateOfChange) {
      rateMap.set(zone.zoneId, rateOfChange);
    }

    let heatLossBtuHr = null;
    let indoorOutdoorDeltaF = null;
    const temp = zone.currentTempF;

    if (temp !== null && weather?.tempF !== null && weather?.tempF !== undefined) {
      indoorOutdoorDeltaF = Math.round((temp - weather.tempF) * 10) / 10;
      const R = thermalResistances.get(zone.zoneId) || DEFAULT_R;
      heatLossBtuHr = Math.round(estimateHeatLoss(temp, weather.tempF, R) * 10) / 10;
    }

    zoneAnalyses.set(zone.zoneId, {
      zoneId: zone.zoneId,
      rateOfChange,
      heatLossBtuHr,
      indoorOutdoorDeltaF,
    });
  }

  // ── 2. Zone-to-zone deltas (only adjacent) ─────
  /** @type {ZoneDeltaResult[]} */
  const deltas = [];
  const zoneMap = new Map(zones.map(z => [z.zoneId, z]));
  const processedPairs = new Set();

  for (const zone of zones) {
    for (const adjId of zone.adjacentZoneIds) {
      const pairKey = [zone.zoneId, adjId].sort().join('::');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const adjZone = zoneMap.get(adjId);
      if (!adjZone) continue;

      deltas.push({
        zoneAId: zone.zoneId,
        zoneBId: adjId,
        zoneAName: zone.name,
        zoneBName: adjZone.name,
        delta: calcZoneDelta(zone, adjZone),
      });
    }
  }

  // ── 3. Whole-house metrics ─────────────────────
  const houseSpread = calcWholeHouseSpread(zones);
  const uniformityScore = calcUniformityScore(zones);

  // ── 4. Anomaly detection ───────────────────────
  const anomalies = detectAnomalies(zones, weather, rateMap);
  const overallStatus = worstLevel(anomalies);

  return {
    zoneAnalyses,
    deltas,
    houseSpread,
    uniformityScore,
    anomalies,
    overallStatus,
  };
}
