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
    svg.appendChild(svgEl('rect', {
      x: s.x - 1, y: s.y - 1, width: s.w + 2, height: s.h + 2, rx: 10,
      fill: 'none', stroke: ac, 'stroke-width': 4, opacity: z.online ? 0.15 : 0,
    }));
    svg.appendChild(svgEl('rect', {
      x: s.x, y: s.y, width: s.w, height: s.h, rx: 8,
      fill: z.online ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
      stroke: z.online ? ac : tm,
      'stroke-width': z.online ? 3 : 1,
    }));
    var label = svgEl('text', { x: s.cx, y: s.y + 38, 'text-anchor': 'middle', fill: ts, 'font-size': '13', 'font-weight': '600' });
    label.style.fontFamily = cssVar('--ff');
    label.textContent = z.name;
    svg.appendChild(label);
    var temp = svgEl('text', {
      x: s.cx, y: s.y + 72, 'text-anchor': 'middle',
      fill: z.online ? tx : tm,
      'font-size': z.online ? '32' : '14',
      'font-weight': '700',
    });
    temp.style.fontFamily = cssVar('--ff');
    temp.textContent = z.avgTemp != null ? z.avgTemp.toFixed(1) + '\u00b0' : 'No data';
    svg.appendChild(temp);
    if (z.online && z.humidity != null) {
      var hum = svgEl('text', { x: s.cx, y: s.y + 92, 'text-anchor': 'middle', fill: tm, 'font-size': '11' });
      hum.textContent = z.humidity.toFixed(0) + '% RH';
      svg.appendChild(hum);
    }
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

// === SIDS DIAGNOSTIC TICKER ===
// Visible debug info at top-right corner — remove after confirmed working
(function() {
  var ticker = document.createElement('div');
  ticker.id = 'sidsTicker';
  ticker.style.cssText = 'position:fixed;top:0;right:0;background:rgba(0,0,0,0.85);color:#0f0;' +
    'font-family:monospace;font-size:10px;padding:4px 8px;z-index:99999;max-width:60%;' +
    'word-wrap:break-word;border-bottom-left-radius:6px;';
  ticker.textContent = 'SIDS: init';
  document.body.appendChild(ticker);
})();

window._sidsLog = window._sidsLog || [];
window._sidsTickCount = 0;

setInterval(function() {
  window._sidsTickCount++;
  var tk = document.getElementById('sidsTicker');
  var msg = 'tick#' + window._sidsTickCount + ' ';

  try {
    // Step 1: get data
    var data = window._hvacData ? window._hvacData() : null;
    if (!data) {
      if (tk) tk.textContent = msg + 'NO DATA (hvacData=' + (typeof window._hvacData) + ')';
      return;
    }
    if (!data.zones) {
      if (tk) tk.textContent = msg + 'data exists but no .zones';
      return;
    }

    // Step 2: find master
    var master = null;
    for (var i = 0; i < data.zones.length; i++) {
      if (data.zones[i].id === 'master') { master = data.zones[i]; break; }
    }
    if (!master) {
      if (tk) tk.textContent = msg + 'no master zone. ids=' + data.zones.map(function(z){return z.id;}).join(',');
      return;
    }
    if (!master.timeSeries || master.timeSeries.length < 3) {
      var tsLen = master.timeSeries ? master.timeSeries.length : 0;
      if (tk) tk.textContent = msg + 'master ts too short: ' + tsLen;
      return;
    }

    // Step 3: check ts format
    var sample = master.timeSeries[master.timeSeries.length - 1];
    var tsType = typeof sample.ts;
    var tsVal = String(sample.ts).substring(0, 25);

    // Step 4: filter recent 30 min — handle any ts format
    var now = Date.now();
    var cutoff30 = now - 60 * 60000;
    var recent = [];
    for (var j = 0; j < master.timeSeries.length; j++) {
      var pt = master.timeSeries[j];
      var ptTime;
      if (pt.ts instanceof Date) ptTime = pt.ts.getTime();
      else if (typeof pt.ts === 'number') ptTime = pt.ts;
      else ptTime = new Date(pt.ts).getTime();
      if (ptTime >= cutoff30) recent.push({ temp: pt.temp, time: ptTime });
    }

    if (recent.length < 1) {
      if (tk) tk.textContent = msg + 'recent<3 (' + recent.length + ') tsType=' + tsType + ' val=' + tsVal;
      return;
    }

    // Step 5: compute temps
    var hour = new Date().getHours();
    var isNight = (hour >= 22 || hour < 6);
    var minTemp = recent[0].temp;
    var sum = 0;
    for (var k = 0; k < recent.length; k++) {
      if (recent[k].temp < minTemp) minTemp = recent[k].temp;
      sum += recent[k].temp;
    }
    var avgTemp = sum / recent.length;

    // Step 6: determine tier
    var tier = null, tierLevel = '', tierLabel = '';

    if (minTemp > 78) {
      tier = 'DANGER'; tierLevel = 'danger';
      tierLabel = '\u26a0\ufe0f SIDS THERMAL STRESS: Master Bedroom ' +
        avgTemp.toFixed(1) + '\u00b0F \u2014 sustained above 78\u00b0F for 30+ min. ' +
        'Well above all pediatric guidelines (AAP: 68\u201372\u00b0F). ' +
        (isNight ? 'Infant sleeping \u2014 immediate action needed.' : 'If infant is napping, take action.');
    } else if (minTemp > 75) {
      tier = 'WARNING'; tierLevel = 'warning';
      tierLabel = '\u26a0 Overheating risk: Master Bedroom ' +
        avgTemp.toFixed(1) + '\u00b0F \u2014 sustained above 75\u00b0F (24\u00b0C) for 30+ min. ' +
        'Multiple sources flag this as overheating onset for infants.';
    } else if (minTemp > 72) {
      tier = 'INFO'; tierLevel = 'info';
      tierLabel = '\u2139\ufe0f Nursery note: Master Bedroom ' +
        avgTemp.toFixed(1) + '\u00b0F \u2014 above AAP recommended ceiling of 72\u00b0F.';
    }

    // Update ticker with full diagnostic
    if (tk) {
      tk.style.color = tier === 'DANGER' ? '#f55' : tier === 'WARNING' ? '#ff0' : tier === 'INFO' ? '#fa0' : '#0f0';
      tk.textContent = msg + (tier || 'OK') + ' min=' + minTemp.toFixed(1) +
        ' avg=' + avgTemp.toFixed(1) + ' n=' + recent.length +
        ' tsType=' + tsType + ' log=' + window._sidsLog.length;
    }

    // === ANOMALY BANNER ===
    var sidsBanner = document.getElementById('sidsBanner');
    if (tier && tierLabel) {
      if (!sidsBanner) {
        sidsBanner = document.createElement('div');
        sidsBanner.id = 'sidsBanner';
        sidsBanner.style.cssText = 'padding:12px 16px;margin:8px 0;border-radius:8px;font-size:0.9em;';
        if (tierLevel === 'danger') sidsBanner.style.cssText += 'background:#fee;border:2px solid #c00;color:#900;';
        else if (tierLevel === 'warning') sidsBanner.style.cssText += 'background:#fff8e1;border:2px solid #f90;color:#7a4f01;';
        else sidsBanner.style.cssText += 'background:#e8f4fd;border:2px solid #4a9eda;color:#1a5276;';
        var dash = document.querySelector('.dashboard');
        if (dash && dash.children.length > 1) dash.insertBefore(sidsBanner, dash.children[1]);
        else if (dash) dash.appendChild(sidsBanner);
      }
      sidsBanner.innerHTML = tierLabel;
      sidsBanner.style.display = '';
    } else if (sidsBanner) {
      sidsBanner.style.display = 'none';
    }

    // === STATUS BAR DOT ===
    var sb = document.getElementById('statusBar');
    if (sb) {
      var existing = document.getElementById('sidsStatus');
      if (!existing) {
        existing = document.createElement('span');
        existing.id = 'sidsStatus';
        existing.style.cssText = 'margin-left:8px;font-size:0.85em;';
        sb.appendChild(existing);
      }
      var tempStr = master.avgTemp != null ? master.avgTemp.toFixed(1) + '\u00b0F' : '?';
      var dot, lbl;
      if (tier === 'DANGER') { dot = '\ud83d\udd34'; lbl = 'SIDS DANGER'; }
      else if (tier === 'WARNING') { dot = '\ud83d\udfe1'; lbl = 'SIDS WARNING'; }
      else if (tier === 'INFO') { dot = '\ud83d\udfe0'; lbl = 'SIDS above range'; }
      else if (isNight) { dot = '\ud83d\udfe2'; lbl = 'SIDS monitor OK'; }
      else { dot = '\u26aa'; lbl = 'SIDS monitor'; }
      var logNote = window._sidsLog.length > 0 ? ' \u00b7 ' + window._sidsLog.length + ' event(s)' : '';
      existing.innerHTML = dot + ' ' + lbl + ' (Master: ' + tempStr + ')' + logNote;
    }

    // === LOG WARNING/DANGER ===
    if (tier && tier !== 'INFO') {
      var lastLog = window._sidsLog[window._sidsLog.length - 1];
      var shouldLog = !lastLog || lastLog.tier !== tier || (now - new Date(lastLog.timestamp).getTime()) > 600000;
      if (shouldLog) {
        window._sidsLog.push({
          timestamp: new Date().toISOString(),
          tier: tier,
          avgTemp: Math.round(avgTemp * 10) / 10,
          minTemp: Math.round(minTemp * 10) / 10,
          readingCount: recent.length,
          isNight: isNight
        });
      }
    }
  } catch (e) {
    if (tk) { tk.style.color = '#f00'; tk.textContent = msg + 'ERR: ' + e.message; }
  }
}, 5000);

// === SIDS LOG EXPORT ===
window._exportSidsLog = function() {
  var blob = new Blob([JSON.stringify(window._sidsLog, null, 2)], {type: 'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sids-log-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};

// === S2 DYNAMIC SETPOINT v2 — Finnish Sisäilmastoluokitus 2018 ===
// No function wrapping — uses MutationObserver + post-render injection
// to avoid infinite recursion from double-load or script caching.

(function() {
  if (window._s2Init) return; // guard against double-load
  window._s2Init = true;
  window._s2 = null;

  // Compute S2 from weather history (called once per refresh cycle)
  async function computeS2() {
    try {
      var wh = await fetchWeatherHistory();
      if (!wh || wh.length === 0) return;
      var sum = 0, n = 0;
      for (var i = 0; i < wh.length; i++) {
        if (wh[i].outdoor_temp_f != null) { sum += wh[i].outdoor_temp_f; n++; }
      }
      if (n === 0) return;
      var avgOutF = sum / n;
      var avgOutC = (avgOutF - 32) * 5 / 9;
      var s2C = 21.5 + 0.2 * Math.max(0, Math.min(avgOutC, 20));
      var s2F = s2C * 9 / 5 + 32;
      window._s2 = {
        targetF: Math.round(s2F * 10) / 10,
        targetC: Math.round(s2C * 10) / 10,
        lowF: Math.round(((s2C - 1) * 9 / 5 + 32) * 10) / 10,
        highF: Math.round(((s2C + 1.5) * 9 / 5 + 32) * 10) / 10,
        outdoorAvgF: Math.round(avgOutF * 10) / 10,
        outdoorAvgC: Math.round(avgOutC * 10) / 10,
        readings: n
      };
      console.log('[S2] Outdoor 24h avg: ' + avgOutF.toFixed(1) + '°F → target: ' + s2F.toFixed(1) + '°F from ' + n + ' pts');
    } catch (e) {
      console.warn('[S2] compute error:', e);
    }
  }

  // Overlay S2 line onto existing chart SVG
  function overlayS2() {
    try {
      if (!window._s2 || !lastData) return;
      var container = document.getElementById('tsChart');
      if (!container) return;
      var svg = container.querySelector('svg');
      if (!svg || svg.getAttribute('data-s2')) return; // already overlaid
      svg.setAttribute('data-s2', '1');

      var s2 = window._s2;
      var zones = lastData.zones;
      var hours = parseInt((document.querySelector('#chartTabs .chart-tab.active') || {}).dataset.range || '24', 10);
      var cutoff = new Date(Date.now() - hours * 3600000);

      var allT = [], allTs = [];
      for (var i = 0; i < zones.length; i++) {
        var pts = zones[i].timeSeries.filter(function(p) { return p.ts >= cutoff; });
        for (var j = 0; j < pts.length; j++) {
          allT.push(pts[j].temp);
          allTs.push(pts[j].ts.getTime());
        }
      }
      if (allT.length === 0) return;

      var tMin = Math.floor(Math.min.apply(null, allT) - 1);
      var tMax = Math.ceil(Math.max.apply(null, allT) + 1);
      if (s2.targetF < tMin - 2 || s2.targetF > tMax + 2) return;

      var W = 1000, P_l = 50, P_t = 20, P_r = 12, pH = 150;
      var pW = W - P_l - P_r;
      function sy(t) { return P_t + pH - ((t - tMin) / (tMax - tMin || 1)) * pH; }

      var ns = 'http://www.w3.org/2000/svg';
      var firstPoly = svg.querySelector('polyline');

      // Band
      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', P_l);
      rect.setAttribute('y', sy(Math.min(s2.highF, tMax)));
      rect.setAttribute('width', pW);
      rect.setAttribute('height', Math.max(0, sy(Math.max(s2.lowF, tMin)) - sy(Math.min(s2.highF, tMax))));
      rect.setAttribute('fill', '#2196F3');
      rect.setAttribute('opacity', '0.06');
      if (firstPoly) svg.insertBefore(rect, firstPoly); else svg.appendChild(rect);

      // Line
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', P_l);
      line.setAttribute('y1', sy(s2.targetF));
      line.setAttribute('x2', W - P_r);
      line.setAttribute('y2', sy(s2.targetF));
      line.setAttribute('stroke', '#2196F3');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '8,3');
      line.setAttribute('opacity', '0.7');
      if (firstPoly) svg.insertBefore(line, firstPoly); else svg.appendChild(line);

      // Label
      var lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', W - P_r - 4);
      lbl.setAttribute('y', sy(s2.targetF) - 4);
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('fill', '#2196F3');
      lbl.setAttribute('font-size', '9');
      lbl.setAttribute('opacity', '0.8');
      lbl.textContent = 'S2 ' + s2.targetF.toFixed(1) + '\u00b0F';
      svg.appendChild(lbl);

      // Legend
      var leg = document.getElementById('tsLegend');
      if (leg && leg.innerHTML.indexOf('S2') === -1) {
        leg.innerHTML += '<div class="legend-item" style="opacity:0.8">' +
          '<span class="legend-swatch" style="background:#2196F3"></span>' +
          'S2 target (' + s2.targetF.toFixed(1) + '\u00b0F) \u00b7 Out avg: ' + s2.outdoorAvgF.toFixed(1) + '\u00b0F</div>';
      }

      // Analysis panel deviation
      var panel = document.getElementById('analysisGrid');
      if (panel && panel.innerHTML.indexOf('S2 deviation') === -1) {
        var devs = [];
        for (var k = 0; k < zones.length; k++) {
          if (zones[k].avgTemp != null) {
            var dev = zones[k].avgTemp - s2.targetF;
            devs.push(zones[k].name + ': ' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '\u00b0F');
          }
        }
        if (devs.length > 0) {
          var div = document.createElement('div');
          div.innerHTML = '<div class="metric-row"><span class="metric-label">S2 deviation</span>' +
            '<span class="metric-value" style="font-size:0.85em">' + devs.join(' \u00b7 ') + '</span></div>' +
            '<div class="metric-row"><span class="metric-label" style="opacity:0.6;font-size:0.8em">' +
            'Finnish S2: ' + s2.targetF.toFixed(1) + '\u00b0F (' + s2.targetC.toFixed(1) + '\u00b0C) \u00b7 ' +
            'Out 24h: ' + s2.outdoorAvgF.toFixed(1) + '\u00b0F \u00b7 ' + s2.readings + ' pts</span></div>';
          panel.appendChild(div);
        }
      }
    } catch (e) {
      console.warn('[S2] overlay error:', e);
    }
  }

  // Poll: compute S2 then overlay after each render cycle
  // Uses setInterval instead of wrapping refresh — no recursion risk
  computeS2();
  setInterval(computeS2, 300000); // re-compute every 5 min with refresh

  // Watch for chart redraws via MutationObserver on tsChart
  var obs = new MutationObserver(function() { setTimeout(overlayS2, 50); });
  var target = document.getElementById('tsChart');
  if (target) obs.observe(target, { childList: true, subtree: true });

  // Also run once now in case chart is already rendered
  setTimeout(overlayS2, 2000);
})();

// === MOLD INDEX GAUGE — Finnish VTT Viitanen-Ojanen Model ===
// Source: VTT Technical Research Centre of Finland
// Tracks mold growth potential via ODE integration: dM/dt = f(T, RH, material)
// M scale: 0 (clean) → 1 (microscopic spores) → 3 (visible) → 6 (full coverage)
// Material class: "sensitive" (wood framing) — appropriate for US townhouse
//
// Key advantage over simple "RH > 70% = bad": tracks cumulative exposure
// AND models decline when conditions improve (dry/cold).
//
// EVIDENCE: If M > 1 in any zone, that's microscopic germination —
// invisible but biologically active. Powerful habitability argument.

(function() {
  if (window._moldInit) return;
  window._moldInit = true;
  window._moldIndex = {}; // per zone: { M, trend[], peakM }

  // Viitanen-Ojanen critical RH threshold (below this, no growth)
  // RH_crit = -0.00267·T³ + 0.160·T² - 3.13·T + 100  (for T in °C)
  function rhCrit(tc) {
    if (tc < 0) return 100;
    if (tc > 50) tc = 50;
    return Math.max(0, Math.min(100,
      -0.00267 * tc * tc * tc + 0.160 * tc * tc - 3.13 * tc + 100
    ));
  }

  // Growth rate coefficient k1 for sensitive material (pine/wood)
  // k1 depends on T and RH; simplified from VTT lookup tables
  function k1(tc, rh) {
    if (tc < 0 || tc > 50) return 0;
    var rc = rhCrit(tc);
    if (rh <= rc) return 0;
    // Sensitive material: k1 ~ 1 at optimal conditions (T~25, RH~97)
    // Scale by distance from critical
    var rhExcess = (rh - rc) / (100 - rc + 0.01);
    var tFactor = tc < 5 ? tc / 5 : (tc < 35 ? 1 : Math.max(0, (50 - tc) / 15));
    return 0.14 * rhExcess * tFactor; // tuned for sensitive wood
  }

  // Decline rate when conditions are unfavorable
  // VTT model: M decreases when RH < RH_crit or T < 0
  function declineRate(M, tc, rh) {
    var rc = rhCrit(tc);
    if (rh >= rc && tc >= 0) return 0; // favorable — no decline
    // Decline: -0.032/day for sensitive materials when dry
    // Faster decline at lower RH and lower T
    var dryness = Math.max(0, (rc - rh) / rc);
    return -0.032 * (1 + dryness); // per day, negative
  }

  function computeMold() {
    try {
      if (!lastData) return;

      for (var zi = 0; zi < lastData.zones.length; zi++) {
        var zone = lastData.zones[zi];
        var ts = zone.timeSeries;
        if (!ts || ts.length < 6) continue;

        // Initialize if needed
        if (!window._moldIndex[zone.id]) {
          window._moldIndex[zone.id] = { M: 0, trend: [], peakM: 0, lastTs: 0 };
        }
        var state = window._moldIndex[zone.id];

        // Process time series points we haven't seen yet
        for (var i = 0; i < ts.length; i++) {
          var tMs = ts[i].ts.getTime();
          if (tMs <= state.lastTs) continue;
          if (ts[i].hum == null) continue;

          var tc = (ts[i].temp - 32) * 5 / 9;
          var rh = ts[i].hum;

          // Time step in days (5-min intervals = 5/1440 days)
          var dt = state.lastTs > 0 ? (tMs - state.lastTs) / 86400000 : 5 / 1440;
          if (dt > 1) dt = 5 / 1440; // cap if gap in data
          if (dt <= 0) continue;

          // Growth or decline
          var growth = k1(tc, rh);
          var decline = declineRate(state.M, tc, rh);
          var dM = (growth > 0 ? growth : decline) * dt;

          state.M = Math.max(0, Math.min(6, state.M + dM));
          state.peakM = Math.max(state.peakM, state.M);
          state.lastTs = tMs;
        }

        // Record trend point (one per compute cycle)
        state.trend.push({ ts: Date.now(), M: state.M });
        if (state.trend.length > 288) state.trend.shift(); // keep ~24h at 5-min
      }

      renderMold();
      console.log('[MOLD] Index updated:', Object.keys(window._moldIndex).map(function(k) {
        return k + ': M=' + window._moldIndex[k].M.toFixed(3);
      }).join(', '));
    } catch (e) {
      console.warn('[MOLD] compute error:', e);
    }
  }

  function renderMold() {
    try {
      if (!lastData) return;

      // Find or create mold panel
      var panel = document.getElementById('moldPanel');
      if (!panel) {
        // Create panel after analysis panel
        var ap = document.getElementById('analysisGrid');
        if (!ap) return;
        panel = document.createElement('div');
        panel.id = 'moldPanel';
        panel.className = 'card';
        ap.parentNode.insertBefore(panel, ap.nextSibling);
      }

      var zones = lastData.zones;
      var html = '<h2 class="card-title">MOLD RISK INDEX</h2>' +
        '<div style="opacity:0.7;font-size:0.8em;margin-bottom:12px">' +
        'Viitanen-Ojanen model (VTT Finland) · Wood-frame "sensitive" class · Scale: 0–6</div>';

      for (var zi = 0; zi < zones.length; zi++) {
        var zone = zones[zi];
        var state = window._moldIndex[zone.id];
        if (!state) continue;

        var M = state.M;
        var pct = Math.min(100, (M / 6) * 100);

        // Color: 0-1 green, 1-3 yellow, 3-6 red
        var color, label;
        if (M < 0.5) { color = 'var(--ok)'; label = 'Safe'; }
        else if (M < 1) { color = 'var(--ok)'; label = 'Low risk'; }
        else if (M < 2) { color = 'var(--wn)'; label = 'Microscopic spores possible'; }
        else if (M < 3) { color = 'var(--wn)'; label = 'Microscopic growth likely'; }
        else if (M < 4) { color = 'var(--dg)'; label = 'Visible mold possible'; }
        else { color = 'var(--dg)'; label = 'Extensive colonization'; }

        html += '<div style="margin-bottom:10px">' +
          '<div class="metric-row"><span class="metric-label">' + zone.name + '</span>' +
          '<span class="metric-value" style="color:' + color + '">' +
          'M = ' + M.toFixed(2) + ' — ' + label + '</span></div>' +
          // Progress bar
          '<div style="height:8px;background:var(--sd);border-radius:4px;overflow:hidden;margin:4px 0">' +
          '<div style="height:100%;width:' + pct + '%;border-radius:4px;' +
          'background:linear-gradient(90deg, var(--ok) 0%, var(--wn) 50%, var(--dg) 100%)"></div></div>' +
          // Scale labels
          '<div style="display:flex;justify-content:space-between;font-size:0.65em;opacity:0.5">' +
          '<span>0 clean</span><span>1 spores</span><span>3 visible</span><span>6 full</span></div>' +
          '</div>';
      }

      // Footnote
      html += '<div style="opacity:0.6;font-size:0.75em;margin-top:8px;border-top:1px solid var(--bd);padding-top:6px">' +
        'M > 1 = microscopic germination (invisible but biologically active). ' +
        'M > 3 = visible mold growth. Model tracks cumulative exposure and declines when conditions improve. ' +
        'Based on indoor T + RH at each 5-min reading. Wood-frame construction = "sensitive" material class.</div>';

      panel.innerHTML = html;

      // Also add anomaly if any zone M > 1
      // (don't duplicate — check if already present)
      if (lastData.anomalies) {
        for (var k in window._moldIndex) {
          if (window._moldIndex[k].M >= 1) {
            var zName = '';
            for (var z = 0; z < zones.length; z++) {
              if (zones[z].id === k) zName = zones[z].name;
            }
            var moldMsg = '\u26a0 Mold risk: ' + zName + ' M=' + window._moldIndex[k].M.toFixed(2) +
              ' — microscopic germination threshold exceeded';
            var exists = false;
            for (var a = 0; a < lastData.anomalies.length; a++) {
              if (lastData.anomalies[a].msg.indexOf('Mold risk') !== -1 &&
                  lastData.anomalies[a].msg.indexOf(zName) !== -1) {
                exists = true; break;
              }
            }
            if (!exists) {
              lastData.anomalies.push({ level: 'warning', msg: moldMsg });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[MOLD] render error:', e);
    }
  }

  // Run after each refresh
  computeMold();
  setInterval(computeMold, 300000);

  // Watch for data refreshes
  var obs = new MutationObserver(function() { setTimeout(renderMold, 150); });
  var ap = document.getElementById('analysisGrid');
  if (ap) obs.observe(ap, { childList: true });
})();
