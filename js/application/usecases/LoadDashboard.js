/**
 * LoadDashboard — Use Case
 * 
 * Orchestrates the full data loading cycle:
 * 1. Fetch readings from DataPort
 * 2. Fetch weather from DataPort
 * 3. Hydrate domain entities (Sensors → Zones)
 * 4. Return a DashboardSnapshot for presentation
 * 
 * This is the "driving" side of the hex architecture —
 * it calls ports, never concrete adapters.
 */

import { Reading } from '../../domain/entities/Reading.js';
import { WeatherSnapshot } from '../../domain/entities/WeatherSnapshot.js';

/**
 * @typedef {Object} DashboardSnapshot
 * @property {import('../../domain/entities/Zone.js').Zone[]} zones
 * @property {WeatherSnapshot|null} weather
 * @property {Date} loadedAt
 * @property {{ total: number, loaded: number, failed: string[] }} stats
 */

/**
 * Execute the dashboard load.
 * 
 * @param {{
 *   dataPort: import('../ports/DataPort.js').DataPort,
 *   clockPort: import('../ports/ClockPort.js').ClockPort,
 *   zones: import('../../domain/entities/Zone.js').Zone[],
 *   hours: number,
 * }} deps
 * @returns {Promise<DashboardSnapshot>}
 */
export async function loadDashboard({ dataPort, clockPort, zones, hours = 24 }) {
  const now = clockPort.now();
  const failed = [];

  // ── 1. Fetch readings ──────────────────────────
  let rawReadings = [];
  try {
    rawReadings = await dataPort.fetchReadings(hours);
  } catch (err) {
    console.error('[LoadDashboard] Failed to fetch readings:', err);
    failed.push('readings');
  }

  // ── 2. Fetch weather ───────────────────────────
  let weather = null;
  try {
    const rawWeather = await dataPort.fetchLatestWeather();
    if (rawWeather) {
      weather = new WeatherSnapshot({
        timestamp: rawWeather.timestamp,
        tempF: rawWeather.outdoor_temp_f,
        humidity: rawWeather.outdoor_humidity,
        windSpeedMph: rawWeather.wind_speed_mph,
        windDirection: rawWeather.wind_direction,
        gustSpeedMph: rawWeather.wind_gust_mph,
        barometricPressurePa: rawWeather.barometric_pressure_pa,
        dewpointF: rawWeather.dewpoint_f,
        cloudCoverPct: rawWeather.cloud_cover_pct,
        precipitationIn: rawWeather.precipitation_last_hour_in,
      });
    }
  } catch (err) {
    console.error('[LoadDashboard] Failed to fetch weather:', err);
    failed.push('weather');
  }

  // ── 3. Hydrate readings into domain entities ───
  const readings = rawReadings.map(r => new Reading({
    sensorId: r.sensor_id,
    timestamp: new Date(r.timestamp),
    tempF: r.temp_f,
    humidityPct: r.humidity_pct,
    batteryPct: r.battery_pct,
  }));

  // Distribute readings to their sensors within zones
  let loadedCount = 0;
  for (const zone of zones) {
    for (const sensor of zone.sensors) {
      sensor.clearReadings();
      sensor.ingestReadings(readings);
      loadedCount += sensor.readingCount;
    }
  }

  return {
    zones,
    weather,
    loadedAt: now,
    stats: {
      total: rawReadings.length,
      loaded: loadedCount,
      failed,
    },
  };
}
