import { DataPort } from '../../application/ports/DataPort.js';

export class SupabaseAdapter extends DataPort {
  constructor({ url, anonKey, tableName = 'readings' }) {
    super();
    this._baseUrl = url.replace(/\/$/, '');
    this._anonKey = anonKey;
    this._table = tableName;
  }

  _headers() {
    return {
      'apikey': this._anonKey,
      'Authorization': 'Bearer ' + this._anonKey,
      'Content-Type': 'application/json',
    };
  }

  async fetchReadings(hours) {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const url = this._baseUrl + '/rest/v1/' + this._table +
      '?timestamp=gte.' + since +
      '&temp_f=not.is.null' +
      '&sensor_id=neq.outdoor_weather' +
      '&select=sensor_id,timestamp,temp_f,humidity_pct,battery_pct' +
      '&order=timestamp.asc&limit=10000';
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error('Supabase readings fetch failed: ' + res.status);
    return res.json();
  }

  async fetchLatestWeather() {
    const url = this._baseUrl + '/rest/v1/' + this._table +
      '?sensor_id=eq.outdoor_weather' +
      '&outdoor_temp_f=not.is.null' +
      '&select=timestamp,outdoor_temp_f,outdoor_humidity_pct,wind_speed_mph,wind_gust_mph,wind_direction_deg,wind_chill_f,cloud_cover_pct,dewpoint_f,pressure_inhg,precip_last_hour_in' +
      '&order=timestamp.desc&limit=1';
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error('Supabase weather fetch failed: ' + res.status);
    const rows = await res.json();
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      timestamp: r.timestamp,
      outdoor_temp_f: r.outdoor_temp_f,
      outdoor_humidity: r.outdoor_humidity_pct,
      wind_speed_mph: r.wind_speed_mph,
      wind_gust_mph: r.wind_gust_mph,
      wind_direction: r.wind_direction_deg != null ? r.wind_direction_deg + '°' : null,
      barometric_pressure_pa: r.pressure_inhg ? r.pressure_inhg * 3386.39 : null,
      dewpoint_f: r.dewpoint_f,
      cloud_cover_pct: r.cloud_cover_pct,
      precipitation_last_hour_in: r.precip_last_hour_in,
    };
  }

  async fetchSensorIds() {
    const url = this._baseUrl + '/rest/v1/' + this._table +
      '?sensor_id=not.is.null&select=sensor_id&order=timestamp.desc&limit=200';
    const res = await fetch(url, { headers: this._headers() });
    const rows = await res.json();
    return [...new Set(rows.map(r => r.sensor_id))];
  }
}
