/**
 * ZoneCardRenderer — Presentation Renderer
 * 
 * Renders zone information cards showing current conditions.
 * Each card shows: zone name, temperature, humidity, rate of change,
 * sensor count, and battery status.
 * 
 * Graceful degradation:
 * - 0 sensors → "No sensor" with greyed styling
 * - 1 sensor → direct reading
 * - N sensors → averaged with spread indicator
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   zones: import('../../domain/entities/Zone.js').Zone[],
 *   weather: import('../../domain/entities/WeatherSnapshot.js').WeatherSnapshot|null,
 *   zoneAnalyses: Map<string, import('../../application/usecases/AnalyzeZones.js').ZoneAnalysis>,
 *   anomalies: import('../../domain/services/AnomalyDetection.js').Anomaly[],
 * }} params
 */
export function renderZoneCards({ container, zones, weather, zoneAnalyses, anomalies = [] }) {
  const dangerZones = new Set(anomalies.filter(a => a.level === 'danger').map(a => a.zoneId));
  const warningZones = new Set(anomalies.filter(a => a.level === 'warning').map(a => a.zoneId));

  const html = zones.map(zone => {
    const temp = zone.currentTempF;
    const humidity = zone.currentHumidity;
    const analysis = zoneAnalyses.get(zone.zoneId);
    const rate = analysis?.rateOfChange;
    const deltaOutdoor = analysis?.indoorOutdoorDeltaF;
    const coverage = zone.coverageStatus;

    // Determine card status
    let status = 'ok';
    if (coverage === 'uncovered') status = 'offline';
    else if (dangerZones.has(zone.zoneId)) status = 'danger';
    else if (warningZones.has(zone.zoneId)) status = 'warning';

    // Temperature display
    let tempDisplay;
    if (temp === null) {
      tempDisplay = '<span class="zone-temp-na">No sensor</span>';
    } else {
      tempDisplay = `<span class="zone-temp">${temp.toFixed(1)}°F</span>`;
    }

    // Rate badge
    let rateBadge = '';
    if (rate) {
      const cls = rate.direction === 'rising' ? 'badge-rising'
                : rate.direction === 'falling' ? 'badge-falling'
                : 'badge-stable';
      const arrow = rate.direction === 'rising' ? '↑' : rate.direction === 'falling' ? '↓' : '→';
      rateBadge = `<span class="zone-badge ${cls}">${arrow} ${Math.abs(rate.ratePerHour).toFixed(1)}°/hr</span>`;
    }

    // Meta line items
    const metaItems = [];
    if (humidity !== null) metaItems.push(`${humidity.toFixed(0)}% RH`);
    if (deltaOutdoor !== null) metaItems.push(`ΔT outdoor: ${deltaOutdoor > 0 ? '+' : ''}${deltaOutdoor}°`);
    if (zone.sensorCount > 1 && zone.tempSpreadF !== null) {
      metaItems.push(`spread: ${zone.tempSpreadF.toFixed(1)}°`);
    }
    if (zone.sensorCount > 0) metaItems.push(`${zone.onlineSensors.length}/${zone.sensorCount} sensors`);

    // Battery warnings
    const lowBatt = zone.sensors.filter(s => s.currentBattery !== null && s.currentBattery < 20);
    if (lowBatt.length > 0) {
      metaItems.push(`🔋 ${lowBatt.map(s => `${s.label}: ${s.currentBattery}%`).join(', ')}`);
    }

    return `
      <div class="zone-card" data-status="${status}" data-zone="${zone.zoneId}">
        <div class="zone-name">${zone.name} ${rateBadge}</div>
        ${tempDisplay}
        ${metaItems.length > 0 ? `<div class="zone-meta">${metaItems.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}
