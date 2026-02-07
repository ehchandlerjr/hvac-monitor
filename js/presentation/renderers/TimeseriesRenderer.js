/**
 * TimeseriesRenderer — Presentation Renderer
 * 
 * Renders a pure SVG multi-line timeseries chart.
 * No external dependencies (no Chart.js, no D3).
 * 
 * Features:
 * - One line per zone + optional outdoor line
 * - Hover tooltips with crosshair
 * - Responsive (viewBox-based)
 * - 6h / 12h / 24h range tabs
 * - Reads colors from CSS custom properties
 */

const CHART_PADDING = { top: 20, right: 12, bottom: 30, left: 45 };
const VIEWBOX_W = 800;
const VIEWBOX_H = 240;

const LINE_VARS = ['--line-1', '--line-2', '--line-3', '--line-4'];
const OUTDOOR_VAR = '--line-outdoor';

/**
 * @param {{
 *   container: HTMLElement,
 *   legendContainer: HTMLElement,
 *   tooltipEl: HTMLElement,
 *   zones: import('../../domain/entities/Zone.js').Zone[],
 *   weather: import('../../domain/entities/WeatherSnapshot.js').WeatherSnapshot|null,
 *   hours: number,
 *   outdoorSeries?: { timestamp: Date, tempF: number }[],
 * }} params
 */
export function renderTimeseries({ container, legendContainer, tooltipEl, zones, weather, hours, outdoorSeries = [] }) {
  const plotW = VIEWBOX_W - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = VIEWBOX_H - CHART_PADDING.top - CHART_PADDING.bottom;

  // ── Gather all series ──────────────────────────
  const allSeries = [];
  const coveredZones = zones.filter(z => z.coverageStatus !== 'uncovered');

  for (let i = 0; i < coveredZones.length; i++) {
    const zone = coveredZones[i];
    const data = zone.getTimeSeries(hours);
    if (data.length > 0) {
      allSeries.push({
        label: zone.name,
        data,
        colorVar: LINE_VARS[i % LINE_VARS.length],
        dashed: false,
      });
    }
  }

  // Outdoor line (if data exists)
  if (outdoorSeries.length > 0) {
    allSeries.push({
      label: 'Outdoor',
      data: outdoorSeries,
      colorVar: OUTDOOR_VAR,
      dashed: true,
    });
  }

  if (allSeries.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">No data for selected range</div>';
    legendContainer.innerHTML = '';
    return;
  }

  // ── Compute axis bounds ────────────────────────
  const allTemps = allSeries.flatMap(s => s.data.map(d => d.tempF));
  const allTimes = allSeries.flatMap(s => s.data.map(d => d.timestamp.getTime()));

  const tempMin = Math.floor(Math.min(...allTemps) - 1);
  const tempMax = Math.ceil(Math.max(...allTemps) + 1);
  const timeMin = Math.min(...allTimes);
  const timeMax = Math.max(...allTimes);

  const scaleX = t => CHART_PADDING.left + ((t - timeMin) / (timeMax - timeMin || 1)) * plotW;
  const scaleY = t => CHART_PADDING.top + plotH - ((t - tempMin) / (tempMax - tempMin || 1)) * plotH;

  // ── Build SVG ──────────────────────────────────
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_W} ${VIEWBOX_H}`);
  svg.style.width = '100%';
  svg.style.height = '100%';

  // Grid lines (horizontal)
  const gridSteps = niceSteps(tempMin, tempMax, 5);
  for (const val of gridSteps) {
    const y = scaleY(val);
    svg.appendChild(svgEl('line', {
      x1: CHART_PADDING.left, y1: y,
      x2: VIEWBOX_W - CHART_PADDING.right, y2: y,
      stroke: 'var(--chart-grid)', 'stroke-width': 1,
    }));
    svg.appendChild(svgEl('text', {
      x: CHART_PADDING.left - 6, y: y + 4,
      'text-anchor': 'end', fill: 'var(--chart-text)',
      'font-size': '10', 'font-family': 'var(--font-mono)',
    })).textContent = `${val}°`;
  }

  // Time labels (bottom axis)
  const timeSteps = niceTimeSteps(timeMin, timeMax, 6);
  for (const t of timeSteps) {
    const x = scaleX(t);
    const d = new Date(t);
    const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    svg.appendChild(svgEl('text', {
      x, y: VIEWBOX_H - 6,
      'text-anchor': 'middle', fill: 'var(--chart-text)',
      'font-size': '10', 'font-family': 'var(--font-mono)',
    })).textContent = label;
  }

  // Data lines
  for (const series of allSeries) {
    if (series.data.length < 2) continue;
    const points = series.data.map(d => `${scaleX(d.timestamp.getTime())},${scaleY(d.tempF)}`).join(' ');
    svg.appendChild(svgEl('polyline', {
      points,
      fill: 'none',
      stroke: `var(${series.colorVar})`,
      'stroke-width': series.dashed ? 1.5 : 2,
      'stroke-dasharray': series.dashed ? '6,4' : 'none',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }));
  }

  // Invisible hover rect for tooltip interaction
  const hoverRect = svgEl('rect', {
    x: CHART_PADDING.left, y: CHART_PADDING.top,
    width: plotW, height: plotH,
    fill: 'transparent',
  });
  svg.appendChild(hoverRect);

  // Crosshair line (hidden initially)
  const crosshair = svgEl('line', {
    x1: 0, y1: CHART_PADDING.top,
    x2: 0, y2: CHART_PADDING.top + plotH,
    stroke: 'var(--text-muted)', 'stroke-width': 1,
    'stroke-dasharray': '4,3', opacity: 0,
  });
  svg.appendChild(crosshair);

  // Hover interaction
  const handleHover = (e) => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
    const hoverTime = timeMin + ((svgX - CHART_PADDING.left) / plotW) * (timeMax - timeMin);

    crosshair.setAttribute('x1', svgX);
    crosshair.setAttribute('x2', svgX);
    crosshair.setAttribute('opacity', '0.5');

    // Find nearest point per series
    const lines = allSeries.map(s => {
      const nearest = s.data.reduce((best, d) =>
        Math.abs(d.timestamp.getTime() - hoverTime) < Math.abs(best.timestamp.getTime() - hoverTime) ? d : best
      );
      return `<span style="color:var(${s.colorVar})">${s.label}: ${nearest.tempF.toFixed(1)}°F</span>`;
    });

    const hoverDate = new Date(hoverTime);
    const timeStr = hoverDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    tooltipEl.innerHTML = `<strong>${timeStr}</strong><br>${lines.join('<br>')}`;
    tooltipEl.classList.add('visible');

    // Position tooltip
    const ttRect = container.getBoundingClientRect();
    const relX = e.clientX - ttRect.left;
    tooltipEl.style.left = `${relX + (relX > ttRect.width / 2 ? -160 : 16)}px`;
    tooltipEl.style.top = '10px';
  };

  hoverRect.addEventListener('mousemove', handleHover);
  hoverRect.addEventListener('mouseleave', () => {
    crosshair.setAttribute('opacity', '0');
    tooltipEl.classList.remove('visible');
  });

  container.innerHTML = '';
  container.appendChild(svg);

  // ── Legend ──────────────────────────────────────
  legendContainer.innerHTML = allSeries.map(s =>
    `<div class="legend-item">
      <span class="legend-swatch" style="background:var(${s.colorVar});${s.dashed ? 'background:repeating-linear-gradient(90deg,var(' + s.colorVar + ') 0 6px,transparent 6px 10px)' : ''}"></span>
      ${s.label}
    </div>`
  ).join('');
}

// ── Helpers ──────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function niceSteps(min, max, count) {
  const range = max - min;
  const step = Math.ceil(range / count) || 1;
  const steps = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) steps.push(v);
  return steps;
}

function niceTimeSteps(min, max, count) {
  const step = (max - min) / count;
  const steps = [];
  for (let i = 0; i <= count; i++) steps.push(min + step * i);
  return steps;
}
