/**
 * SupabaseAdapter — Infrastructure Adapter
 * 
 * Implements DataPort by querying Supabase's REST API.
 * Uses the PostgREST auto-generated API (no SDK needed in browser).
 * 
 * Requires: SUPABASE_URL and SUPABASE_ANON_KEY injected via config.
 */

import { DataPort } from '../../application/ports/DataPort.js';

export class SupabaseAdapter extends DataPort {
  /**
   * @param {{ url: string, anonKey: string, tableName?: string }} config
   */
  constructor({ url, anonKey, tableName = 'readings' }) {
    super();
    this._baseUrl = url.replace(/\/$/, '');
    this._anonKey = anonKey;
    this._table = tableName;
  }

  /** Common headers for Supabase REST API */
  _headers() {
    return {
      'apikey': this._anonKey,
      'Authorization': `Bearer ${this._anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  }

  /**
   * Fetch sensor readings from the last N hours.
   * Filters to rows that have a non-null sensor_id (excludes weather-only rows).
   */
  async fetchReadings(hours) {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();

    const url = `${this._baseUrl}/rest/v1/${this._table}` +
      `?timestamp=gte.${since}` +
      `&sensor_id=not.is.null` +
      `&select=sensor_id,timestamp,temp_f,humidity_pct,battery_pct` +
      `&order=timestamp.asc` +
      `&limit=10000`;

    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`Supabase fetch failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Fetch the most recent weather data.
   * Weather rows are those with outdoor_temp_f populated.
   */
  async fetchLatestWeather() {
    const url = `${this._baseUrl}/rest/v1/${this._table}` +
      `?outdoor_temp_f=not.is.null` +
      `&select=timestamp,outdoor_temp_f,outdoor_humidity,wind_speed_mph,wind_direction,wind_gust_mph,barometric_pressure_pa,dewpoint_f,cloud_cover_pct,precipitation_last_hour_in` +
      `&order=timestamp.desc` +
      `&limit=1`;

    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`Supabase weather fetch failed: ${res.status} ${res.statusText}`);
    }
    const rows = await res.json();
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Discover distinct sensor IDs that have reported data.
   */
  async fetchSensorIds() {
    const url = `${this._baseUrl}/rest/v1/rpc/distinct_sensor_ids`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: '{}',
      });
      if (res.ok) {
        const data = await res.json();
        return data.map(r => r.sensor_id);
      }
    } catch {
      // Fallback: fetch last 100 readings and dedupe
    }

    // Fallback approach if the RPC doesn't exist
    const url2 = `${this._baseUrl}/rest/v1/${this._table}` +
      `?sensor_id=not.is.null` +
      `&select=sensor_id` +
      `&order=timestamp.desc` +
      `&limit=200`;

    const res = await fetch(url2, { headers: this._headers() });
    const rows = await res.json();
    return [...new Set(rows.map(r => r.sensor_id))];
  }
}
