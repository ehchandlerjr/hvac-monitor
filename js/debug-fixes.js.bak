// === VISUAL PATCHES v4 — HIGH CONTRAST ===

// FLOOR PLAN — actually visible this time
renderFloorPlan = function(zones) {
  const fp = document.getElementById('floorPlan');
  if (!fp) return;
  const tx = cssVar('--tx'), ts = cssVar('--ts'), tm = cssVar('--tm'), ac = cssVar('--ac');
  const svg = svgEl('svg', { viewBox: '0 0 400 300' });
  svg.style.cssText = 'width:100%;display:block;';
  for (const z of zones) {
    const s = z.svg;
    // Glow behind room
    svg.appendChild(svgEl('rect', {
      x: s.x - 1, y: s.y - 1, width: s.w + 2, height: s.h + 2, rx: 10,
      fill: 'none', stroke: ac, 'stroke-width': 4, opacity: z.online ? 0.15 : 0,
    }));
    // Room box — strong fill
    svg.appendChild(svgEl('rect', {
      x: s.x, y: s.y, width: s.w, height: s.h, rx: 8,
      fill: z.online ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
      stroke: z.online ? ac : tm,
      'stroke-width': z.online ? 3 : 1,
    }));
    // Room name
    var label = svgEl('text', { x: s.cx, y: s.y + 38, 'text-anchor': 'middle', fill: ts, 'font-size': '13', 'font-weight': '600' });
    label.style.fontFamily = cssVar('--ff');
    label.textContent = z.name;
    svg.appendChild(label);
    // Big temperature
    var temp = svgEl('text', {
      x: s.cx, y: s.y + 72, 'text-anchor': 'middle',
      fill: z.online ? tx : tm,
      'font-size': z.online ? '32' : '14',
      'font-weight': '700',
    });
    temp.style.fontFamily = cssVar('--ff');
    temp.textContent = z.avgTemp != null ? z.avgTemp.toFixed(1) + '\u00b0' : 'No data';
    svg.appendChild(temp);
    // Humidity
    if (z.online && z.humidity != null) {
      var hum = svgEl('text', { x: s.cx, y: s.y + 92, 'text-anchor': 'middle', fill: tm, 'font-size': '11' });
      hum.textContent = z.humidity.toFixed(0) + '% RH';
      svg.appendChild(hum);
    }
    // Rate arrow
    if (z.online && z.rate && z.rate.dir !== 'stable') {
      var arrow = z.rate.dir === 'rising' ? '\u25b2' : '\u25bc';
      var rateColor = z.rate.dir === 'rising' ? cssVar('--dg') : cssVar('--ok');
      var rc = svgEl('text', { x: s.cx, y: s.y + 108, 'text-anchor': 'middle', fill: rateColor, 'font-size': '10', 'font-weight': '600' });
      rc.textContent = arrow + ' ' + Math.abs(z.rate.perHour).toFixed(1) + '\u00b0/hr';
      svg.appendChild(rc);
    }
  }
  fp.innerHTML = '';
  fp.appendChild(svg);
};

// BULLET CHART — HTML layout, clear on mobile
renderBulletCharts = function(zones) {
  var el = document.getElementById('bulletCharts');
  if (!el) return;
  var lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];
  var items = zones.filter(function(z) { return z.avgTemp != null; }).map(function(z, i) {
    return { name: z.name, dev: z.avgTemp - SETPOINT, temp: z.avgTemp, color: lineColors[i % 4] };
  });
  if (items.length === 0) { el.innerHTML = '<div class="no-data">No data</div>'; return; }
  var maxDev = Math.max(10, Math.max.apply(null, items.map(function(i) { return Math.abs(i.dev) + 2; })));
  var html = '';
  items.forEach(function(item) {
    var pct = 50 + (item.dev / maxDev) * 50;
    var bandOk = 50 - (1 / maxDev) * 50;
    var bandOkW = (2 / maxDev) * 50;
    var bandWn = 50 - (3 / maxDev) * 50;
    var bandWnW = (6 / maxDev) * 50;
    var devStr = (item.dev >= 0 ? '+' : '') + item.dev.toFixed(1) + '\u00b0';
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

// CARPET PLOT — visible cells
renderCarpetPlot = function(zones) {
  var el = document.getElementById('carpetPlot');
  var tabsEl = document.getElementById('carpetTabs');
  if (!el) return;
  if (tabsEl) {
    tabsEl.innerHTML = zones.map(function(z, i) {
      return '<button class="chart-tab' + (i === 0 ? ' active' : '') + '" data-zone="' + i + '">' + z.name + '</button>';
    }).join('');
    tabsEl.onclick = function(e) {
      var btn = e.target.closest('.chart-tab');
      if (!btn) return;
      tabsEl.querySelectorAll('.chart-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      drawCarpet(zones[parseInt(btn.dataset.zone)]);
    };
  }
  function drawCarpet(zone) {
    var ts = zone.timeSeries;
    if (ts.length < 4) { el.innerHTML = '<div class="no-data">Collecting data\u2026</div>'; return; }
    var now = new Date();
    var days = 7, grid = [], dayLabels = [];
    for (var d = days - 1; d >= 0; d--) {
      var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      dayLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }));
      var row = new Array(24).fill(null);
      var counts = new Array(24).fill(0);
      for (var p = 0; p < ts.length; p++) {
        var pDate = new Date(ts[p].ts);
        if (pDate.getFullYear() === dayStart.getFullYear() && pDate.getMonth() === dayStart.getMonth() && pDate.getDate() === dayStart.getDate()) {
          var h = pDate.getHours();
          row[h] = (row[h] || 0) + ts[p].temp;
          counts[h]++;
        }
      }
      for (var h2 = 0; h2 < 24; h2++) { if (counts[h2] > 0) row[h2] /= counts[h2]; }
      grid.push(row);
    }
    var cellW = 11, cellH = 24, PL = 34, PT = 16;
    var svgW = PL + 24 * cellW + 2;
    var svgH = PT + grid.length * cellH + 2;
    var tm = cssVar('--tm'), sd = cssVar('--sd');
    var svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH });
    svg.style.cssText = 'width:100%;display:block;';
    for (var hh = 0; hh < 24; hh += 4) {
      var lbl = svgEl('text', { x: PL + hh * cellW + cellW / 2, y: PT - 4, 'text-anchor': 'middle', fill: tm, 'font-size': '7' });
      lbl.textContent = (hh < 10 ? '0' : '') + hh;
      svg.appendChild(lbl);
    }
    for (var di = 0; di < grid.length; di++) {
      var dl = svgEl('text', { x: PL - 3, y: PT + di * cellH + cellH / 2 + 3, 'text-anchor': 'end', fill: tm, 'font-size': '7' });
      dl.textContent = dayLabels[di];
      svg.appendChild(dl);
      for (var hi = 0; hi < 24; hi++) {
        var v = grid[di][hi];
        var fill = sd, op = 0.12;
        if (v != null) {
          op = 0.9;
          var dev = v - SETPOINT;
          if (dev < -5) fill = '#2166ac';
          else if (dev < -3) fill = '#4575b4';
          else if (dev < -1) fill = '#91bfdb';
          else if (dev <= 1) fill = '#66c2a5';
          else if (dev <= 3) fill = '#fee08b';
          else if (dev <= 5) fill = '#fc8d59';
          else fill = '#d73027';
        }
        svg.appendChild(svgEl('rect', {
          x: PL + hi * cellW, y: PT + di * cellH,
          width: cellW - 1, height: cellH - 1,
          rx: 2, fill: fill, opacity: op,
        }));
      }
    }
    el.innerHTML = '';
    el.appendChild(svg);
  }
  if (zones.length > 0) drawCarpet(zones[0]);
};

// Force re-render NOW
if (lastData) renderAll(lastData, chartHours);
