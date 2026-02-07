/**
 * MockAdapter — Infrastructure Adapter
 * 
 * Implements DataPort with procedurally generated realistic data.
 * Used for development, demo mode, and when Supabase is unreachable.
 * 
 * Generates sinusoidal temperature curves with:
 * - Diurnal pattern (warmer afternoons, cooler nights)
 * - Per-sensor noise
 * - One "problem" sensor that drifts lower (simulates damper issue)
 * - Realistic outdoor temps based on time of day
 */

import { DataPort } from '../../application/ports/DataPort.js';

export class MockAdapter extends DataPort {
  constructor({ sensorIds = ['nursery_bed', 'elijah_mid', 'master_bassinet', 'downstairs_thermo'] } = {}) {
    super();
    this._sensorIds = sensorIds;
  }

  async fetchReadings(hours) {
    const readings = [];
    const now = Date.now();
    const intervalMs = 5 * 60_000; // 5-minute intervals
    const totalPoints = Math.floor((hours * 3_600_000) / intervalMs);

    for (let i = 0; i < totalPoints; i++) {
      const timestamp = new Date(now - (totalPoints - i) * intervalMs);
      const hourOfDay = timestamp.getHours() + timestamp.getMinutes() / 60;

      for (const sensorId of this._sensorIds) {
        const base = this._baseTempForSensor(sensorId, hourOfDay);
        const noise = (Math.random() - 0.5) * 0.6;

        readings.push({
          sensor_id: sensorId,
          timestamp: timestamp.toISOString(),
          temp_f: Math.round((base + noise) * 100) / 100,
          humidity_pct: Math.round((42 + Math.random() * 8) * 10) / 10,
          battery_pct: Math.round(85 + Math.random() * 15),
        });
      }
    }

    return readings;
  }

  async fetchLatestWeather() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    // Winter outdoor temp: diurnal swing centered around 32°F
    const outdoorTemp = 32 + 8 * Math.sin((hour - 14) * Math.PI / 12);

    return {
      timestamp: now.toISOString(),
      outdoor_temp_f: Math.round(outdoorTemp * 10) / 10,
      outdoor_humidity: Math.round(55 + Math.random() * 20),
      wind_speed_mph: Math.round((5 + Math.random() * 15) * 10) / 10,
      wind_direction: ['N', 'NE', 'NW', 'W'][Math.floor(Math.random() * 4)],
      wind_gust_mph: Math.round((10 + Math.random() * 20) * 10) / 10,
      barometric_pressure_pa: Math.round(101325 + (Math.random() - 0.5) * 2000),
      dewpoint_f: Math.round((25 + Math.random() * 6) * 10) / 10,
      cloud_cover_pct: Math.round(Math.random() * 100),
      precipitation_last_hour_in: 0,
    };
  }

  async fetchSensorIds() {
    return [...this._sensorIds];
  }

  // ── Internal helpers ───────────────────────────

  /**
   * Simulate different thermal behavior per sensor.
   * nursery_bed intentionally runs cold (damper issue).
   */
  _baseTempForSensor(sensorId, hourOfDay) {
    // Diurnal HVAC pattern: thermostat setback at night
    const hvacCycle = hourOfDay >= 22 || hourOfDay < 6 ? -1.5 : 0;

    switch (sensorId) {
      case 'nursery_bed':
        // THE PROBLEM: runs 3-6°F cold, worse at night
        return 68 + hvacCycle - 3 - (hourOfDay >= 22 || hourOfDay < 6 ? 3 : 0)
          + 1.5 * Math.sin((hourOfDay - 14) * Math.PI / 12);
      case 'elijah_mid':
        // Same HVAC zone as nursery but closer to the duct — warmer
        return 71 + hvacCycle + 0.8 * Math.sin((hourOfDay - 14) * Math.PI / 12);
      case 'master_bassinet':
        // Control zone: well-regulated
        return 72 + hvacCycle * 0.5 + 0.5 * Math.sin((hourOfDay - 14) * Math.PI / 12);
      case 'downstairs_thermo':
        // Near thermostat: very stable
        return 72 + 0.3 * Math.sin((hourOfDay - 14) * Math.PI / 12);
      default:
        return 71 + hvacCycle + Math.sin((hourOfDay - 14) * Math.PI / 12);
    }
  }
}
