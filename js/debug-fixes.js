// Patch bullet chart sizing for mobile
const _origBullet = renderBulletCharts;
renderBulletCharts = function(zones) {
  const el = document.getElementById('bulletCharts');
  if (!el) return;

  const lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];
  const tm = cssVar('--tm'), tx = cssVar('--tx'), ok = cssVar('--ok');
  const wn = cssVar('--wn'), dg = cssVar('--dg'), sd = cssVar('--sd');

  const items = zones.filter(z => z.avgTemp != null).map((z, i) => {
    const dev = z.avgTemp - SETPOINT;
    return { name: z.name, dev, temp: z.avgTemp, color: lineColors[i % 4] };
  });
  if (items.length === 0) { el.innerHTML = '<div class="no-data">No data</div>'; return; }

  const maxDev = Math.max(8, ...items.map(i => Math.abs(i.dev) + 2));
  const W = 360, H = 36, GAP = 8;
  const PL = 4, PR = 50;
  const svgH = items.length * (H + GAP) + 8;

  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + svgH });
  svg.style.cssText = 'width:100%;display:block;';

  const barLeft = PL;
  const barRight = W - PR;
  const barW = barRight - barLeft;
  const cx = barLeft + barW / 2; // setpoint center

  items.forEach((item, idx) => {
    const y = idx * (H + GAP) + 4;

    // Background
    svg.appendChild(svgEl('rect', { x: barLeft, y: y, width: barW, height: H, rx: 4, fill: sd, opacity: 0.5 }));

    // ±3° yellow band
    const w3 = (3 / maxDev) * (barW / 2);
    svg.appendChild(svgEl('rect', { x: cx - w3, y: y, width: w3 * 2, height: H, rx: 3, fill: wn, opacity: 0.1 }));

    // ±1° green band
    const w1 = (1 / maxDev) * (barW / 2);
    svg.appendChild(svgEl('rect', { x: cx - w1, y: y, width: w1 * 2, height: H, rx: 3, fill: ok, opacity: 0.2 }));

    // Setpoint line
    svg.appendChild(svgEl('line', { x1: cx, y1: y + 2, x2: cx, y2: y + H - 2, stroke: tm, 'stroke-width': 1.5, 'stroke-dasharray': '3,3' }));

    // Actual deviation marker
    const markerX = cx + (item.dev / maxDev) * (barW / 2);
    svg.appendChild(svgEl('circle', { cx: markerX, cy: y + H / 2, r: 6, fill: item.color }));

    // Room name inside bar
    const lbl = svgEl('text', { x: barLeft + 8, y: y + H / 2 + 4, fill: tx, 'font-size': '10', opacity: 0.7 });
    lbl.textContent = item.name;
    svg.appendChild(lbl);

    // Temp + deviation on right
    const devStr = (item.dev >= 0 ? '+' : '') + item.dev.toFixed(1) + '°';
    const vt = svgEl('text', { x: W - 4, y: y + H / 2 + 4, 'text-anchor': 'end', fill: tx, 'font-size': '11', 'font-weight': '600' });
    vt.textContent = devStr;
    svg.appendChild(vt);
  });

  el.innerHTML = '';
  el.appendChild(svg);
};

// Patch carpet plot for mobile
const _origCarpet = renderCarpetPlot;
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
    if (ts.length < 6) { el.innerHTML = '<div class="no-data">Not enough data</div>'; return; }

    const now = new Date();
    const days = 7;
    const grid = [];
    const dayLabels = [];
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
      for (let h = 0; h < 24; h++) {
        if (counts[h] > 0) row[h] /= counts[h]; else row[h] = null;
      }
      grid.push(row);
    }

    // Mobile-optimized sizes
    const cellW = 12, cellH = 28;
    const PL = 36, PT = 18, PB = 4;
    const svgW = PL + 24 * cellW + 4;
    const svgH = PT + grid.length * cellH + PB;
    const tm = cssVar('--tm'), sd = cssVar('--sd'), ok = cssVar('--ok');

    const svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH });
    svg.style.cssText = 'width:100%;display:block;';

    // Hour labels (every 6h)
    for (let h = 0; h < 24; h += 6) {
      const lbl = svgEl('text', { x: PL + h * cellW + cellW / 2, y: PT - 5, 'text-anchor': 'middle', fill: tm, 'font-size': '8' });
      lbl.textContent = h.toString().padStart(2, '0');
      svg.appendChild(lbl);
    }

    for (let d = 0; d < grid.length; d++) {
      const dl = svgEl('text', { x: PL - 4, y: PT + d * cellH + cellH / 2 + 3, 'text-anchor': 'end', fill: tm, 'font-size': '8' });
      dl.textContent = dayLabels[d];
      svg.appendChild(dl);

      for (let h = 0; h < 24; h++) {
        const v = grid[d][h];
        let fill = sd;
        let opacity = 0.15;
        if (v != null) {
          opacity = 0.85;
          const dev = v - SETPOINT;
          if (dev < -5) fill = '#2166ac';
          else if (dev < -3) fill = '#4575b4';
          else if (dev < -1) fill = '#91bfdb';
          else if (dev < 1) fill = ok;
          else if (dev < 3) fill = '#fee090';
          else if (dev < 5) fill = '#fc8d59';
          else fill = '#d73027';
        }
        svg.appendChild(svgEl('rect', {
          x: PL + h * cellW, y: PT + d * cellH,
          width: cellW - 1, height: cellH - 1,
          rx: 2, fill, opacity,
        }));
      }
    }

    el.innerHTML = '';
    el.appendChild(svg);
  }

  if (zones.length > 0) drawCarpet(zones[0]);
};

// Patch floor plan — thicker borders, more visible fills
const _origFloor = renderFloorPlan;
renderFloorPlan = function(zones) {
  const fp = document.getElementById('floorPlan');
  if (!fp) return;

  const bg = cssVar('--bg'), sf = cssVar('--sf'), sd = cssVar('--sd');
  const tx = cssVar('--tx'), ts = cssVar('--ts'), tm = cssVar('--tm');
  const bd = cssVar('--bd') || 'rgba(128,128,128,0.2)', ac = cssVar('--ac');

  const svg = svgEl('svg', { viewBox: '0 0 400 300' });
  svg.style.cssText = 'width:100%;display:block;';

  for (const z of zones) {
    const s = z.svg;
    svg.appendChild(svgEl('rect', {
      x: s.x, y: s.y, width: s.w, height: s.h, rx: 8,
      fill: z.online ? sf : bg,
      stroke: z.online ? ac : bd,
      'stroke-width': z.online ? 2.5 : 1,
      opacity: z.online ? 1 : 0.5,
    }));

    const label = svgEl('text', { x: s.cx, y: s.y + 45, 'text-anchor': 'middle', fill: ts, 'font-size': '12' });
    label.style.fontFamily = cssVar('--ff');
    label.textContent = z.name;
    svg.appendChild(label);

    const temp = svgEl('text', {
      x: s.cx, y: s.y + 78, 'text-anchor': 'middle',
      fill: z.online ? tx : tm,
      'font-size': z.online ? '28' : '13',
      'font-weight': z.online ? '700' : '400',
    });
    temp.style.fontFamily = cssVar('--ff');
    temp.textContent = z.avgTemp != null ? z.avgTemp.toFixed(1) + '°' : 'No data';
    svg.appendChild(temp);

    // Humidity under temp
    if (z.online && z.humidity != null) {
      const hum = svgEl('text', { x: s.cx, y: s.y + 100, 'text-anchor': 'middle', fill: tm, 'font-size': '10' });
      hum.textContent = z.humidity.toFixed(0) + '% RH';
      svg.appendChild(hum);
    }
  }

  fp.innerHTML = '';
  fp.appendChild(svg);
};
