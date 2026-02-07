/**
 * AnalysisRenderer — Presentation Renderer
 * 
 * Renders the thermal analysis summary grid and zone-to-zone
 * differential table. Reads from AnalysisResult, produces DOM.
 */

/**
 * @param {{
 *   analysisContainer: HTMLElement,
 *   deltaContainer: HTMLElement,
 *   analysis: import('../../application/usecases/AnalyzeZones.js').AnalysisResult,
 *   weather: import('../../domain/entities/WeatherSnapshot.js').WeatherSnapshot|null,
 * }} params
 */
export function renderAnalysis({ analysisContainer, deltaContainer, analysis, weather }) {
  // ── Summary grid ───────────────────────────────
  const items = [];

  // Whole-house spread
  if (analysis.houseSpread) {
    items.push({
      label: 'House Spread',
      value: `${analysis.houseSpread.spreadF.toFixed(1)}°F`,
      detail: `${analysis.houseSpread.coldest} → ${analysis.houseSpread.warmest}`,
    });
  }

  // Uniformity score
  if (analysis.uniformityScore !== null) {
    const pct = (analysis.uniformityScore * 100).toFixed(0);
    items.push({
      label: 'Uniformity',
      value: `${pct}%`,
      detail: analysis.uniformityScore > 0.8 ? 'Good' : analysis.uniformityScore > 0.5 ? 'Fair' : 'Poor',
    });
  }

  // Outdoor conditions
  if (weather) {
    items.push({
      label: 'Outdoor',
      value: `${weather.tempF.toFixed(1)}°F`,
      detail: [
        weather.humidity !== null ? `${weather.humidity}% RH` : null,
        weather.windSpeedMph !== null ? `${weather.windSpeedMph.toFixed(0)} mph ${weather.windDirection || ''}` : null,
      ].filter(Boolean).join(' · '),
    });

    if (weather.isExtremeWeather) {
      items.push({
        label: 'Extreme Weather',
        value: '⚠️ Active',
        detail: 'Good for system identification',
      });
    }
  }

  // Fastest changing zone
  let fastestRate = null;
  let fastestZoneId = null;
  for (const [zoneId, za] of analysis.zoneAnalyses) {
    if (za.rateOfChange && Math.abs(za.rateOfChange.ratePerHour) > Math.abs(fastestRate?.ratePerHour || 0)) {
      fastestRate = za.rateOfChange;
      fastestZoneId = zoneId;
    }
  }
  if (fastestRate && fastestRate.direction !== 'stable') {
    items.push({
      label: 'Fastest Change',
      value: `${Math.abs(fastestRate.ratePerHour).toFixed(1)}°/hr`,
      detail: `${fastestZoneId} (${fastestRate.direction})`,
    });
  }

  // Active anomaly count
  const warningCount = analysis.anomalies.filter(a => a.level === 'warning').length;
  const dangerCount = analysis.anomalies.filter(a => a.level === 'danger').length;
  if (warningCount + dangerCount > 0) {
    items.push({
      label: 'Alerts',
      value: dangerCount > 0 ? `${dangerCount} critical` : `${warningCount} warning`,
      detail: `${analysis.anomalies.length} total`,
    });
  }

  analysisContainer.innerHTML = items.map(item => `
    <div class="analysis-item">
      <div class="analysis-label">${item.label}</div>
      <div class="analysis-value">${item.value}</div>
      ${item.detail ? `<div class="analysis-detail">${item.detail}</div>` : ''}
    </div>
  `).join('');

  // ── Delta grid ─────────────────────────────────
  if (analysis.deltas.length === 0) {
    deltaContainer.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);">No adjacent zone pairs with data</div>';
    return;
  }

  deltaContainer.innerHTML = analysis.deltas.map(d => {
    if (!d.delta) {
      return `
        <div class="delta-item">
          <span class="delta-pair">${d.zoneAName} ↔ ${d.zoneBName}</span>
          <span class="delta-value" style="color:var(--text-muted)">n/a</span>
        </div>
      `;
    }
    const isHigh = d.delta.abs > 3;
    return `
      <div class="delta-item">
        <span class="delta-pair">${d.zoneAName} ↔ ${d.zoneBName}</span>
        <span class="delta-value ${isHigh ? 'high' : ''}">${d.delta.deltaF > 0 ? '+' : ''}${d.delta.deltaF}°F</span>
      </div>
    `;
  }).join('');
}
