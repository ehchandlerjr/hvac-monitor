/**
 * WeatherSnapshot — Value Object
 * 
 * Outdoor environmental conditions at a point in time.
 * Used for heat transfer calculations (indoor-outdoor ΔT),
 * building envelope analysis, and contextualizing sensor data.
 * 
 * All weather fields are optional except tempF and timestamp,
 * because NWS may not always return every field.
 */
export class WeatherSnapshot {
  constructor({
    timestamp,
    tempF,
    humidity = null,
    windSpeedMph = null,
    windDirection = null,
    gustSpeedMph = null,
    barometricPressurePa = null,
    dewpointF = null,
    cloudCoverPct = null,
    precipitationIn = null,
    description = '',
  }) {
    Object.freeze(Object.assign(this, {
      timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
      tempF,
      humidity,
      windSpeedMph,
      windDirection,
      gustSpeedMph,
      barometricPressurePa,
      dewpointF,
      cloudCoverPct,
      precipitationIn,
      description,
    }));
  }

  /** Wind chill (simple formula, valid below 50°F and wind > 3mph) */
  get windChillF() {
    if (this.tempF === null || this.windSpeedMph === null) return null;
    if (this.tempF > 50 || this.windSpeedMph < 3) return this.tempF;
    return (
      35.74 +
      0.6215 * this.tempF -
      35.75 * Math.pow(this.windSpeedMph, 0.16) +
      0.4275 * this.tempF * Math.pow(this.windSpeedMph, 0.16)
    );
  }

  /** Is this an extreme weather event? (useful for system identification) */
  get isExtremeWeather() {
    if (this.tempF !== null && (this.tempF < 20 || this.tempF > 95)) return true;
    if (this.windSpeedMph !== null && this.windSpeedMph > 25) return true;
    if (this.gustSpeedMph !== null && this.gustSpeedMph > 40) return true;
    return false;
  }
}
