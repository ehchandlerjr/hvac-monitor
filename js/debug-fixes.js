// === VISUAL PATCHES v3 — Mobile-first fixes ===

// FLOOR PLAN — high contrast rooms
renderFloorPlan = function(zones) {
  const fp = document.getElementById('floorPlan');
  if (!fp) return;
  const tx = cssVar('--tx'), ts = cssVar('--ts'), tm = cssVar('--tm'), ac = cssVar('--ac');
  const svg = svgEl('svg', { viewBox: '0 0 400 300' });
  svg.style.cssText = 'width:100%;display:block;';
  for (const z of zones) {
    const s = z.svg;
    // Visible fill using accent glow
    svg.appendChild(svgEl('rect', {
      x: s.x, y: s.y, width: s.w, height: s.h, rx: 8,
      fill: z.online ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
      stroke: z.online ? ac : tm,
      'stroke-width': z.online ? 2.5 : 1,
    }));
    const label = svgEl('text', { x: s.cx, y: s.y + 40, 'text-anchor': 'middle', fill: ts, 'font-size': '12' });
    label.style.fontFamily = cssVar('--ff');
    label.textContent = z.name;
    svg.appendChild(label);
    const temp = svgEl('text', {
      x: s.cx, y: s.y + 75, 'text-anchor': 'middle',
      fill: z.online ? tx : tm,
      'font-size': z.online ? '30' : '13',
      'font-weight': '700',
    });
    temp.style.fontFamily = cssVar('--ff');
    temp.textContent = z.avgTemp != null ? z.avgTemp.toFixed(1) + '\u00b0' : 'No data';
    svg.appendChild(temp);
    if (z.online && z.humidity != null) {
      const hum = svgEl('text', { x: s.cx, y: s.y + 96, 'text-anchor': 'middle', fill: tm, 'font-size': '10' });
      hum.textContent = z.humidity.toFixed(0) + '% RH';
      svg.appendChild(hum);
    }
    if (z.online && z.rate && z.rate.dir !== 'stable') {
      const arrow = z.rate.dir === 'rising' ? '\u25b2' : '\u25bc';
      const rc = svgEl('text', { x: s.cx, y: s.y + 112, 'text-anchor': 'middle', fill: z.rate.dir === 'rising' ? cssVar('--dg') : cssVar('--ok'), 'font-size': '9' });
      rc.textContent = arrow + ' ' + Math.abs(z.rate.perHour).toFixed(1) + '\u00b0/hr';
      svg.appendChild(rc);
    }
  }
  fp.innerHTML = '';
  fp.appendChild(svg);
};

// BULLET CHART — full width, readable on mobile
renderBulletCharts = function(zones) {
  const el = document.getElementById('bulletCharts');
  if (!el) return;
  const lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];
  const tm = cssVar('--tm'), tx = cssVar('--tx'), ok = cssVar('--ok');
  const wn = cssVar('--wn'), dg = cssVar('--dg'), sd = cssVar('--sd');
  const items = zones.filter(z => z.avgTemp != null).map((z, i) => ({
    name: z.name, dev: z.avgTemp - SETPOINT, temp: z.avgTemp, color: lineColors[i % 4]
  }));
  if (items.length === 0) { el.innerHTML = '<div class="no-data">No data</div>'; return; }
  const maxDev = Math.max(10, ...items.map(i => Math.abs(i.dev) + 2));
  // Vertical layout for mobile
  let html = '';
  items.forEach(item => {
    const pct = 50 + (item.dev / maxDev) * 50;
    const bandOk = 50 - (1 / maxDev) * 50;
    const bandOkW = (2 / maxDev) * 50;
    const bandWn = 50 - (3 / maxDev) * 50;
    const bandWnW = (6 / maxDev) * 50;
    const devStr = (item.dev >= 0 ? '+' : '') + item.dev.toFixed(1) + '\u00b0';
    html += '<div class="bullet-row">' +
      '<div class="bullet-label">' + item.name + '</div>' +
      '<div class="bullet-bar-wrap">' +
        '<div class="bullet-bg"></div>' +
        '<div class="bullet-band-wn" style="left:' + bandWn + '%;width:' + bandWnW + '%"></div>' +
        '<div class="bullet-band-ok" style="left:' + bandOk + '%;width:' + bandOkW + '%"></div>' +
        '<div class="bullet-setpoint" style="left:50%"></div>' +
        '<div class="bullet-marker" style="left:' + pct + '%;background:' + item.color + '"></div>' +
      '</div>' +
      '<div class="bullet-val">' + devStr + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
};

// CARPET PLOT — bigger cells, better colors
renderCarpetPlot = function(zones) {
  const el = document.getElementById('carpetPlot');
  const tabsEl = document.getElementById('carpetTabs');
  if (!el) return;
  if (tabsEl) {
    tabsEl.innerHTML = zones.map((z, i) =>
      '<button class="chart-tab' + (i === 0 ? ' active' : '') + '" data-zone="' + i + '">' + z.name + '</button>'
    ).join('');
    tabsEl.onclick = e => {
      const btn = e.target.closest('.chart-tab');
      if (!btn) return;
      tabsEl.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawCarpet(zones[parseInt(btn.dataset.zone)]);
    };
  }
  function drawCarpet(zone) {
    const ts = zone.timeSeries;
    if (ts.length < 4) { el.innerHTML = '<div class="no-data">Collecting data\u2026 carpet plot needs 24h+</div>'; return; }
    const now = new Date();
    const days = 7;
    const grid = [], dayLabels = [];
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      dayLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }));
      const row = new Array(24).fill(null);
      const counts = new Array(24).fill(0);
      for (const p of ts) {
        const pDate = new Date(p.ts);
        if (pDate.getFullYear() === dayStart.getFullYear() && pDate.getMonth() === dayStart.getMonth() && pDate.getDate() === dayStart.getDate()) {
          const h = pDate.getHours();
          row[h] = (row[h] || 0) + p.temp;
          counts[h]++;
        }
      }
      for (let h = 0; h < 24; h++) { if (counts[h] > 0) row[h] /= counts[h]; }
      grid.push(row);
    }
    const cellW = 11, cellH = 24, PL = 34, PT = 16;
    const svgW = PL + 24 * cellW + 2;
    const svgH = PT + grid.length * cellH + 2;
    const tm = cssVar('--tm'), sd = cssVar('--sd');
    const svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH });
    svg.style.cssText = 'width:100%;display:block;';
    for (let h = 0; h < 24; h += 4) {
      const lbl = svgEl('text', { x: PL + h * cellW + cellW / 2, y: PT - 4, 'text-anchor': 'middle', fill: tm, 'font-size': '7' });
      lbl.textContent = (h < 10 ? '0' : '') + h;
      svg.appendChild(lbl);
    }
    const colorScale = function(v) {
      if (v == null) return { fill: sd, op: 0.12 };
      const dev = v - SETPOINT;
      let fill;
      if (dev < -5) fill = '#2166ac';
      else if (dev < -3) fill = '#4575b4';
      else if (dev < -1) fill = '#91bfdb';
      else if (dev <= 1) fill = '#66c2a5';
      else if (dev <= 3) fill = '#fee08b';
      else if (dev <= 5) fill = '#fc8d59';
      else fill = '#d73027';
      return { fill, op: 0.9 };
    };
    for (let d = 0; d < grid.length; d++) {
      const dl = svgEl('text', { x: PL - 3, y: PT + d * cellH + cellH / 2 + 3, 'text-anchor': 'end', fill: tm, 'font-size': '7' });
      dl.textContent = dayLabels[d];
      svg.appendChild(dl);
      for (let h = 0; h < 24; h++) {
        const c = colorScale(grid[d][h]);
        svg.appendChild(svgEl('rect', {
          x: PL + h * cellW, y: PT + d * cellH,
          width: cellW - 1, height: cellH - 1,
          rx: 2, fill: c.fill, opacity: c.op,
        }));
      }
    }
    el.innerHTML = '';
    el.appendChild(svg);
  }
  if (zones.length > 0) drawCarpet(zones[0]);
};

// Force immediate re-render with patches applied
if (lastData) renderAll(lastData, chartHours);
