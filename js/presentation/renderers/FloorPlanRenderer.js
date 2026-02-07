/**
 * FloorPlanRenderer — Presentation Renderer
 * 
 * Renders an SVG floor plan showing zone outlines with live temperature
 * readings. Each zone is a rectangle whose color reflects its temperature
 * status. Zones without sensors are greyed out.
 * 
 * Single Responsibility: only knows how to draw the floor plan.
 * Receives data, produces DOM — no fetching, no analysis.
 */

const STATUS_COLORS = {
  danger:  'var(--danger)',
  warning: 'var(--warning)',
  ok:      'var(--success)',
  offline: 'var(--text-muted)',
};

/**
 * @param {{
 *   container: HTMLElement,
 *   zones: import('../../domain/entities/Zone.js').Zone[],
 *   anomalies: import('../../domain/services/AnomalyDetection.js').Anomaly[],
 * }} params
 */
export function renderFloorPlan({ container, zones, anomalies = [] }) {
  // Determine viewBox from zone layouts
  let maxX = 400, maxY = 300;
  for (const z of zones) {
    if (!z.svgLayout) continue;
    const { x, w, y, h } = z.svgLayout;
    maxX = Math.max(maxX, x + w + 10);
    maxY = Math.max(maxY, y + h + 10);
  }

  const anomalyByZone = new Map();
  for (const a of anomalies) {
    if (!anomalyByZone.has(a.zoneId) || severityRank(a.level) > severityRank(anomalyByZone.get(a.zoneId).level)) {
      anomalyByZone.set(a.zoneId, a);
    }
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.setAttribute('class', 'house-svg');
  svg.style.width = '100%';
  svg.style.height = '100%';

  for (const zone of zones) {
    const layout = zone.svgLayout;
    if (!layout) continue;

    const temp = zone.currentTempF;
    const hasCoverage = zone.coverageStatus !== 'uncovered';
    const worstAnomaly = anomalyByZone.get(zone.zoneId);
    const statusColor = worstAnomaly ? STATUS_COLORS[worstAnomaly.level] : (hasCoverage ? STATUS_COLORS.ok : STATUS_COLORS.offline);

    // Zone rectangle
    const rect = svgEl('rect', {
      x: layout.x, y: layout.y, width: layout.w, height: layout.h,
      rx: 6, ry: 6,
      fill: hasCoverage ? 'var(--surface-dim)' : 'var(--bg)',
      stroke: statusColor,
      'stroke-width': hasCoverage ? 2 : 1,
      opacity: hasCoverage ? 1 : 0.5,
    });
    svg.appendChild(rect);

    // Zone name label
    const label = svgEl('text', {
      x: layout.cx || layout.x + layout.w / 2,
      y: layout.y + (layout.labelY || layout.h * 0.35),
      'text-anchor': 'middle',
      fill: 'var(--text-secondary)',
      'font-size': '11',
      'font-family': 'var(--font)',
    });
    label.textContent = zone.name;
    svg.appendChild(label);

    // Temperature reading
    const tempText = svgEl('text', {
      x: layout.cx || layout.x + layout.w / 2,
      y: layout.y + (layout.tempY || layout.h * 0.65),
      'text-anchor': 'middle',
      fill: hasCoverage ? 'var(--text)' : 'var(--text-muted)',
      'font-size': hasCoverage ? '22' : '12',
      'font-weight': hasCoverage ? '700' : '400',
      'font-family': 'var(--font)',
    });
    tempText.textContent = temp !== null ? `${temp.toFixed(1)}°` : 'No sensor';
    svg.appendChild(tempText);

    // Sensor count badge (if >1)
    if (zone.sensorCount > 1) {
      const badge = svgEl('text', {
        x: layout.x + layout.w - 10,
        y: layout.y + 16,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '9',
        'font-family': 'var(--font-mono)',
      });
      badge.textContent = `×${zone.sensorCount}`;
      svg.appendChild(badge);
    }
  }

  container.innerHTML = '';
  container.appendChild(svg);
}

// ── Helpers ──────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function severityRank(level) {
  return { info: 0, warning: 1, danger: 2 }[level] || -1;
}
