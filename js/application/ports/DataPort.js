/**
 * DataPort — Application Port (Interface)
 * 
 * Defines the contract that any data source adapter must fulfill.
 * The application layer programs against this interface, never against
 * a concrete implementation. This is the "driven" port in hex architecture.
 * 
 * Implementations: SupabaseAdapter, MockAdapter
 * 
 * SOLID: Dependency Inversion — high-level modules don't depend on low-level details.
 */

/**
 * @typedef {Object} RawReading
 * @property {string} sensor_id
 * @property {string} timestamp - ISO string
 * @property {number} temp_f
 * @property {number|null} humidity_pct
 * @property {number|null} battery_pct
 */

/**
 * @typedef {Object} RawWeather
 * @property {string} timestamp
 * @property {number} outdoor_temp_f
 * @property {number|null} outdoor_humidity
 * @property {number|null} wind_speed_mph
 * @property {string|null} wind_direction
 * @property {number|null} wind_gust_mph
 * @property {number|null} barometric_pressure_pa
 * @property {number|null} dewpoint_f
 * @property {number|null} cloud_cover_pct
 * @property {number|null} precipitation_last_hour_in
 */

/**
 * @interface DataPort
 */
export class DataPort {
  /**
   * Fetch sensor readings within a time window.
   * @param {number} hours - how many hours of history to fetch
   * @returns {Promise<RawReading[]>}
   */
  async fetchReadings(hours) {
    throw new Error('DataPort.fetchReadings() must be implemented');
  }

  /**
   * Fetch the most recent weather snapshot.
   * @returns {Promise<RawWeather|null>}
   */
  async fetchLatestWeather() {
    throw new Error('DataPort.fetchLatestWeather() must be implemented');
  }

  /**
   * Get the list of known sensor IDs (for discovery).
   * @returns {Promise<string[]>}
   */
  async fetchSensorIds() {
    throw new Error('DataPort.fetchSensorIds() must be implemented');
  }
}
