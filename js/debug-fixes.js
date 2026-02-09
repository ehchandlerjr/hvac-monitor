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

// === ADVANCED DIAGNOSTICS: S2 + ACH + Mold Index ===
// Single IIFE, no function wrapping, clean renders
(function() {
  if (window._extrasInit) return;
  window._extrasInit = true;

  window._s2 = null;
  window._achResults = null;
  window._moldIndex = {};

  // ── UTILITIES ──

  function absHumidity(tempF, rhPct) {
    if (tempF == null || rhPct == null) return null;
    var tc = (tempF - 32) * 5 / 9;
    var es = 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
    return (es * (rhPct / 100) * 216.7) / (tc + 273.15);
  }

  function rhCrit(tc) {
    if (tc < 0) return 100;
    if (tc > 50) tc = 50;
    return Math.max(0, Math.min(100,
      -0.00267 * tc * tc * tc + 0.160 * tc * tc - 3.13 * tc + 100));
  }

  function k1Growth(tc, rh) {
    if (tc < 0 || tc > 50) return 0;
    var rc = rhCrit(tc);
    if (rh <= rc) return 0;
    var rhExcess = (rh - rc) / (100 - rc + 0.01);
    var tFactor = tc < 5 ? tc / 5 : (tc < 35 ? 1 : Math.max(0, (50 - tc) / 15));
    return 0.14 * rhExcess * tFactor;
  }

  // ── S2 COMPUTE ──

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
        readings: n
      };
    } catch (e) { console.warn('[S2] compute error:', e); }
  }

  // ── S2 CHART OVERLAY ──

  function overlayS2() {
    try {
      if (!window._s2 || !lastData) return;
      var container = document.getElementById('tsChart');
      if (!container) return;
      var svg = container.querySelector('svg');
      if (!svg || svg.getAttribute('data-s2')) return;
      svg.setAttribute('data-s2', '1');

      var s2 = window._s2;
      var zones = lastData.zones;
      var hours = parseInt((document.querySelector('#chartTabs .chart-tab.active') || {}).dataset.range || '24', 10);
      var cutoff = new Date(Date.now() - hours * 3600000);
      var allT = [];
      for (var i = 0; i < zones.length; i++) {
        var pts = zones[i].timeSeries.filter(function(p) { return p.ts >= cutoff; });
        for (var j = 0; j < pts.length; j++) allT.push(pts[j].temp);
      }
      if (allT.length === 0) return;
      var tMin = Math.floor(Math.min.apply(null, allT) - 1);
      var tMax = Math.ceil(Math.max.apply(null, allT) + 1);
      if (s2.targetF < tMin - 2 || s2.targetF > tMax + 2) return;

      var W = 1000, P_l = 50, P_t = 20, P_r = 12, pH = 150;
      var pW = W - P_l - P_r;
      function sy(t) { return P_t + pH - ((t - tMin) / (tMax - tMin || 1)) * pH; }
      var ns = 'http://www.w3.org/2000/svg';
      var fp = svg.querySelector('polyline');

      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', P_l); rect.setAttribute('width', pW);
      rect.setAttribute('y', sy(Math.min(s2.highF, tMax)));
      rect.setAttribute('height', Math.max(0, sy(Math.max(s2.lowF, tMin)) - sy(Math.min(s2.highF, tMax))));
      rect.setAttribute('fill', '#2196F3'); rect.setAttribute('opacity', '0.06');
      if (fp) svg.insertBefore(rect, fp); else svg.appendChild(rect);

      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', P_l); line.setAttribute('y1', sy(s2.targetF));
      line.setAttribute('x2', W - P_r); line.setAttribute('y2', sy(s2.targetF));
      line.setAttribute('stroke', '#2196F3'); line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '8,3'); line.setAttribute('opacity', '0.7');
      if (fp) svg.insertBefore(line, fp); else svg.appendChild(line);

      var lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', W - P_r - 4); lbl.setAttribute('y', sy(s2.targetF) - 4);
      lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('fill', '#2196F3');
      lbl.setAttribute('font-size', '9'); lbl.setAttribute('opacity', '0.8');
      lbl.textContent = 'S2 ' + s2.targetF.toFixed(1) + '\u00b0F';
      svg.appendChild(lbl);

      var leg = document.getElementById('tsLegend');
      if (leg && leg.innerHTML.indexOf('S2') === -1) {
        leg.innerHTML += '<div class="legend-item" style="opacity:0.8">' +
          '<span class="legend-swatch" style="background:#2196F3"></span>' +
          'S2 target (' + s2.targetF.toFixed(1) + '\u00b0F) \u2014 expected indoor temp given outdoor conditions</div>';
      }
    } catch (e) { console.warn('[S2] overlay error:', e); }
  }

  // ── ACH COMPUTE ──

  function computeACH() {
    try {
      if (!lastData) return;
      var outdoorAH = null;
      if (lastData.weather && lastData.weather.tempF != null && lastData.weather.humidity != null) {
        outdoorAH = absHumidity(lastData.weather.tempF, lastData.weather.humidity);
      }
      if (outdoorAH == null) return;

      var results = [];
      for (var zi = 0; zi < lastData.zones.length; zi++) {
        var zone = lastData.zones[zi];
        var ts = zone.timeSeries;
        if (!ts || ts.length < 12) continue;

        var nightPts = [];
        for (var i = 0; i < ts.length; i++) {
          var h = ts[i].ts.getHours();
          if ((h >= 22 || h <= 8) && ts[i].hum != null) {
            var ah = absHumidity(ts[i].temp, ts[i].hum);
            if (ah != null && ah > outdoorAH) nightPts.push({ ts: ts[i].ts.getTime(), ah: ah });
          }
        }
        if (nightPts.length < 6) continue;

        var decays = [], cur = [nightPts[0]];
        for (var j = 1; j < nightPts.length; j++) {
          if (nightPts[j].ah < cur[cur.length - 1].ah) { cur.push(nightPts[j]); }
          else { if (cur.length >= 4) decays.push(cur.slice()); cur = [nightPts[j]]; }
        }
        if (cur.length >= 4) decays.push(cur.slice());
        if (decays.length === 0) continue;

        var best = null;
        for (var d = 0; d < decays.length; d++) {
          var seg = decays[d], xs = [], ys = [], t0 = seg[0].ts;
          for (var k = 0; k < seg.length; k++) {
            var diff = seg[k].ah - outdoorAH;
            if (diff <= 0.1) continue;
            xs.push((seg[k].ts - t0) / 3600000);
            ys.push(Math.log(diff));
          }
          if (xs.length < 4) continue;
          var n = xs.length, sx = 0, sy2 = 0, sxy = 0, sx2 = 0;
          for (var m = 0; m < n; m++) { sx += xs[m]; sy2 += ys[m]; sxy += xs[m]*ys[m]; sx2 += xs[m]*xs[m]; }
          var denom = n*sx2 - sx*sx;
          if (Math.abs(denom) < 1e-10) continue;
          var slope = (n*sxy - sx*sy2) / denom;
          var ach = -slope;
          if (ach >= 0.1 && ach <= 5.0) {
            if (!best || ach < best.ach) best = { ach: ach, points: n };
          }
        }
        if (best) results.push({ zone: zone.name, ach: Math.round(best.ach*100)/100, belowCode: best.ach < 0.5 });
      }
      window._achResults = results.length > 0 ? results : null;
    } catch (e) { console.warn('[ACH] compute error:', e); }
  }

  // ── MOLD COMPUTE ──

  function computeMold() {
    try {
      if (!lastData) return;
      for (var zi = 0; zi < lastData.zones.length; zi++) {
        var zone = lastData.zones[zi];
        var ts = zone.timeSeries;
        if (!ts || ts.length < 6) continue;
        if (!window._moldIndex[zone.id]) window._moldIndex[zone.id] = { M: 0, peakM: 0, lastTs: 0 };
        var state = window._moldIndex[zone.id];

        for (var i = 0; i < ts.length; i++) {
          var tMs = ts[i].ts.getTime();
          if (tMs <= state.lastTs) continue;
          if (ts[i].hum == null) continue;
          var tc = (ts[i].temp - 32) * 5 / 9;
          var rh = ts[i].hum;
          var dt = state.lastTs > 0 ? (tMs - state.lastTs) / 86400000 : 5/1440;
          if (dt > 1) dt = 5/1440;
          if (dt <= 0) continue;
          var growth = k1Growth(tc, rh);
          var decline = (rh < rhCrit(tc) || tc < 0) ? -0.032 * (1 + Math.max(0, (rhCrit(tc) - rh) / rhCrit(tc))) : 0;
          var dM = (growth > 0 ? growth : decline) * dt;
          state.M = Math.max(0, Math.min(6, state.M + dM));
          state.peakM = Math.max(state.peakM, state.M);
          state.lastTs = tMs;
        }
      }
    } catch (e) { console.warn('[MOLD] compute error:', e); }
  }

  // ── UNIFIED RENDER ──
  // Numbers first, big and clear. Education behind a toggle.

  function renderExtrasPanel() {
    try {
      if (!lastData) return;
      var panel = document.getElementById('extrasPanel');
      if (!panel) {
        var ref = document.getElementById('analysisGrid');
        if (!ref) return;
        panel = document.createElement('div');
        panel.id = 'extrasPanel';
        // Insert as a new card after the thermal analysis card
        var card = ref.closest('.card') || ref.parentNode;
        card.parentNode.insertBefore(panel, card.nextSibling);
      }

      var html = '';
      var zones = lastData.zones;

      // ── S2 DEVIATION TABLE ──
      if (window._s2) {
        var s2 = window._s2;
        html += '<div class="card" style="margin-bottom:12px"><h2 class="card-title">S2 SETPOINT DEVIATION</h2>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:0.9em">';
        html += '<tr style="opacity:0.6;font-size:0.8em"><td>Zone</td><td style="text-align:right">Actual</td>' +
          '<td style="text-align:right">Target</td><td style="text-align:right">Deviation</td></tr>';
        for (var i = 0; i < zones.length; i++) {
          if (zones[i].avgTemp == null) continue;
          var dev = zones[i].avgTemp - s2.targetF;
          var color = Math.abs(dev) > 3 ? 'var(--dg)' : Math.abs(dev) > 1.5 ? 'var(--wn)' : 'var(--ok)';
          html += '<tr><td>' + zones[i].name + '</td>' +
            '<td style="text-align:right">' + zones[i].avgTemp.toFixed(1) + '\u00b0F</td>' +
            '<td style="text-align:right">' + s2.targetF.toFixed(1) + '\u00b0F</td>' +
            '<td style="text-align:right;font-weight:600;color:' + color + '">' +
            (dev >= 0 ? '+' : '') + dev.toFixed(1) + '\u00b0F</td></tr>';
        }
        html += '</table>';
        html += '<details style="margin-top:8px;font-size:0.75em;opacity:0.6"><summary style="cursor:pointer">\u2139\ufe0f What is S2?</summary>' +
          '<p style="margin:4px 0">The Finnish S2 standard defines the expected indoor temperature based on outdoor conditions. ' +
          'Target = 21.5\u00b0C + 0.2 \u00d7 outdoor avg (clamped 0\u201320\u00b0C). ' +
          'Current outdoor 24h avg: ' + s2.outdoorAvgF.toFixed(1) + '\u00b0F from ' + s2.readings + ' readings. ' +
          'Positive deviation = rooms are hotter than they should be.</p></details>';
        html += '</div>';
      }

      // ── MOLD INDEX TABLE ──
      var hasMold = false;
      for (var k in window._moldIndex) { if (window._moldIndex[k].lastTs > 0) { hasMold = true; break; } }

      if (hasMold) {
        html += '<div class="card" style="margin-bottom:12px"><h2 class="card-title">MOLD RISK INDEX</h2>';
        for (var zi2 = 0; zi2 < zones.length; zi2++) {
          var state = window._moldIndex[zones[zi2].id];
          if (!state || state.lastTs === 0) continue;
          var M = state.M;
          var pct = Math.min(100, (M / 6) * 100);
          var color2, lbl;
          if (M < 1) { color2 = 'var(--ok)'; lbl = 'Safe'; }
          else if (M < 3) { color2 = 'var(--wn)'; lbl = 'Spore risk'; }
          else { color2 = 'var(--dg)'; lbl = 'Visible mold risk'; }

          html += '<div style="margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
            '<span>' + zones[zi2].name + '</span>' +
            '<span style="font-size:1.3em;font-weight:700;color:' + color2 + '">' + M.toFixed(2) + ' <span style="font-size:0.6em;font-weight:400">/ 6</span></span>' +
            '</div>' +
            '<div style="height:6px;background:var(--sd);border-radius:3px;overflow:hidden;margin:3px 0">' +
            '<div style="height:100%;width:' + pct + '%;border-radius:3px;' +
            'background:linear-gradient(90deg,var(--ok) 0%,var(--wn) 50%,var(--dg) 100%)"></div></div></div>';
        }
        html += '<details style="margin-top:6px;font-size:0.75em;opacity:0.6"><summary style="cursor:pointer">\u2139\ufe0f What is this?</summary>' +
          '<p style="margin:4px 0">Viitanen-Ojanen model (VTT Finland). Tracks cumulative mold growth potential from temperature + humidity. ' +
          'M &lt; 1 = safe. M 1\u20133 = microscopic spores (invisible but active). M &gt; 3 = visible mold. ' +
          'Wood-frame "sensitive" class. Declines when conditions improve.</p></details>';
        html += '</div>';
      }

      // ── ACH TABLE ──
      if (window._achResults && window._achResults.length > 0) {
        html += '<div class="card" style="margin-bottom:12px"><h2 class="card-title">VENTILATION RATE</h2>';
        for (var a = 0; a < window._achResults.length; a++) {
          var r = window._achResults[a];
          var color3 = r.belowCode ? 'var(--dg)' : 'var(--ok)';
          var status = r.belowCode ? '\u26a0 Below code' : '\u2713 Adequate';
          html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span>' + r.zone + '</span>' +
            '<span style="font-weight:600;color:' + color3 + '">' + r.ach.toFixed(2) + ' ACH &nbsp;' + status + '</span></div>';
        }
        html += '<details style="margin-top:6px;font-size:0.75em;opacity:0.6"><summary style="cursor:pointer">\u2139\ufe0f What is ACH?</summary>' +
          '<p style="margin:4px 0">Air Changes per Hour, estimated from overnight humidity decay. ' +
          'ASHRAE 62.2 requires \u22650.35 ACH (bedrooms) / 0.5 ACH (general). ' +
          'Below-code ventilation is a habitability concern.</p></details>';
        html += '</div>';
      } else {
        html += '<div class="card" style="margin-bottom:12px;opacity:0.5"><h2 class="card-title">VENTILATION RATE</h2>' +
          '<div style="font-size:0.85em">Waiting for overnight humidity data\u2026</div></div>';
      }

      panel.innerHTML = html;
    } catch (e) { console.warn('[EXTRAS] render error:', e); }
  }

  // ── MAIN LOOP ──

  async function runAll() {
    await computeS2();
    computeACH();
    computeMold();
    renderExtrasPanel();
    overlayS2();
  }

  // Initial run with delay (wait for first data fetch)
  setTimeout(runAll, 3000);
  setInterval(runAll, 300000);

  // Watch for chart redraws
  var tsEl = document.getElementById('tsChart');
  if (tsEl) new MutationObserver(function() { setTimeout(overlayS2, 50); }).observe(tsEl, { childList: true, subtree: true });

  // Watch for analysis panel redraws
  var agEl = document.getElementById('analysisGrid');
  if (agEl) new MutationObserver(function() { setTimeout(renderExtrasPanel, 100); }).observe(agEl, { childList: true });
})();

// === FOPDT SYSTEM IDENTIFICATION — Japanese SHASE Method ===
// Fits First Order Plus Dead Time model to each HVAC-on event:
//   T(t) = T_start + K × (1 - e^(-(t-L)/τ))
//
// τ = time constant (how fast zone responds)
// K = gain (steady-state temp change achieved)
// L = dead time (delay before temp starts rising)
//
// FAULT SIGNATURES:
//   Damper stuck:     τ↑↑ in ONE zone, K↓↓, L normal
//   Refrigerant leak: τ↑ in ALL zones, K↓ gradual
//   EEV failure:      τ↑ moderate, L↑↑
//   Thermostat fault: τ normal, K normal, but T_final ≠ setpoint

(function() {
  if (window._fopdtInit) return;
  window._fopdtInit = true;
  window._fopdtResults = null;

  function computeFOPDT() {
    try {
      if (!lastData || !lastData.diagnostics) return;

      var results = [];

      for (var zi = 0; zi < lastData.zones.length; zi++) {
        var zone = lastData.zones[zi];
        var ts = zone.timeSeries;
        if (!ts || ts.length < 12) continue;

        var diag = lastData.diagnostics.zoneResults.find(function(d) { return d.zoneId === zone.id; });
        if (!diag || !diag.cycles || diag.cycles.length === 0) continue;

        var fits = [];

        for (var ci = 0; ci < diag.cycles.length; ci++) {
          var cycle = diag.cycles[ci];
          if (!cycle.on) continue;
          var durMin = (cycle.endTs - cycle.startTs) / 60000;
          if (durMin < 15) continue; // need at least 15 min for meaningful fit

          // Get time series points within this heating segment
          var pts = [];
          for (var p = 0; p < ts.length; p++) {
            var tMs = ts[p].ts.getTime();
            if (tMs >= cycle.startTs.getTime() && tMs <= cycle.endTs.getTime()) {
              pts.push({ t: (tMs - cycle.startTs.getTime()) / 60000, temp: ts[p].temp }); // t in minutes
            }
          }
          if (pts.length < 4) continue;

          var T_start = pts[0].temp;
          var T_final = pts[pts.length - 1].temp;
          var K_est = T_final - T_start;
          if (K_est < 0.3) continue; // heating event too small

          // Estimate dead time L: find when temp first rises > 0.1°F above start
          var L_est = 0;
          for (var li = 1; li < pts.length; li++) {
            if (pts[li].temp - T_start > 0.1) {
              L_est = pts[li].t;
              break;
            }
          }

          // Estimate τ using 63.2% method:
          // At t = L + τ, response reaches 63.2% of final value
          var target632 = T_start + K_est * 0.632;
          var tau_est = null;
          for (var ti = 0; ti < pts.length; ti++) {
            if (pts[ti].temp >= target632 && pts[ti].t > L_est) {
              tau_est = pts[ti].t - L_est;
              break;
            }
          }

          // If 63.2% not reached, estimate from slope at inflection
          if (tau_est == null && pts.length >= 4) {
            // Use initial slope after dead time: τ ≈ K / (dT/dt at t=L)
            var slopeStart = -1;
            for (var si = 0; si < pts.length; si++) {
              if (pts[si].t >= L_est) { slopeStart = si; break; }
            }
            if (slopeStart >= 0 && slopeStart + 2 < pts.length) {
              var dt = pts[slopeStart + 2].t - pts[slopeStart].t;
              var dTemp = pts[slopeStart + 2].temp - pts[slopeStart].temp;
              if (dt > 0 && dTemp > 0) {
                tau_est = K_est / (dTemp / dt);
              }
            }
          }

          if (tau_est == null || tau_est <= 0) continue;

          // Compute fit quality: R² of FOPDT model vs actual
          var ssRes = 0, ssTot = 0;
          var meanTemp = pts.reduce(function(s, p) { return s + p.temp; }, 0) / pts.length;
          for (var ri = 0; ri < pts.length; ri++) {
            var tAdj = pts[ri].t - L_est;
            var predicted = tAdj <= 0 ? T_start : T_start + K_est * (1 - Math.exp(-tAdj / tau_est));
            ssRes += (pts[ri].temp - predicted) * (pts[ri].temp - predicted);
            ssTot += (pts[ri].temp - meanTemp) * (pts[ri].temp - meanTemp);
          }
          var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

          if (r2 > 0.3) { // reasonable fit
            fits.push({
              tau: Math.round(tau_est * 10) / 10,   // minutes
              K: Math.round(K_est * 100) / 100,      // °F
              L: Math.round(L_est * 10) / 10,        // minutes
              r2: Math.round(r2 * 100) / 100,
              durMin: Math.round(durMin),
              startTime: new Date(cycle.startTs).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
            });
          }
        }

        if (fits.length > 0) {
          // Average the parameters across all good fits
          var avgTau = 0, avgK = 0, avgL = 0, avgR2 = 0;
          for (var f = 0; f < fits.length; f++) {
            avgTau += fits[f].tau; avgK += fits[f].K;
            avgL += fits[f].L; avgR2 += fits[f].r2;
          }
          var n = fits.length;
          results.push({
            zone: zone.name,
            zoneId: zone.id,
            tau: Math.round((avgTau / n) * 10) / 10,
            K: Math.round((avgK / n) * 100) / 100,
            L: Math.round((avgL / n) * 10) / 10,
            r2: Math.round((avgR2 / n) * 100) / 100,
            eventCount: n,
            fits: fits
          });
        }
      }

      window._fopdtResults = results.length > 0 ? results : null;

      if (results.length > 0) {
        console.log('[FOPDT] Results:', results.map(function(r) {
          return r.zone + ': \u03c4=' + r.tau + 'min K=' + r.K + '\u00b0F L=' + r.L + 'min (' + r.eventCount + ' events)';
        }).join(', '));
        renderFOPDT();
      } else {
        console.log('[FOPDT] No valid heating events found yet');
      }
    } catch (e) { console.warn('[FOPDT] compute error:', e); }
  }

  function classifyFaults(results) {
    if (results.length < 2) return [];
    var faults = [];

    // Compute averages across all zones
    var allTau = results.map(function(r) { return r.tau; });
    var allK = results.map(function(r) { return r.K; });
    var allL = results.map(function(r) { return r.L; });
    var meanTau = allTau.reduce(function(a,b){return a+b;},0) / allTau.length;
    var meanK = allK.reduce(function(a,b){return a+b;},0) / allK.length;
    var meanL = allL.reduce(function(a,b){return a+b;},0) / allL.length;

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var tauRatio = meanTau > 0 ? r.tau / meanTau : 1;
      var kRatio = meanK > 0 ? r.K / meanK : 1;
      var lRatio = meanL > 0 ? r.L / meanL : 1;

      // Damper stuck: τ way above average for THIS zone, K way below
      if (tauRatio > 1.8 && kRatio < 0.6) {
        faults.push({ zone: r.zone, type: 'Possible damper restriction',
          detail: '\u03c4 is ' + tauRatio.toFixed(1) + '\u00d7 avg, gain is ' + Math.round(kRatio*100) + '% of avg',
          severity: 'warning' });
      }

      // EEV failure: high dead time
      if (lRatio > 2.0 && r.L > 5) {
        faults.push({ zone: r.zone, type: 'High dead time',
          detail: 'L=' + r.L + ' min (' + lRatio.toFixed(1) + '\u00d7 avg) — possible EEV or valve delay',
          severity: 'info' });
      }
    }

    // All zones high τ = system-wide issue (refrigerant?)
    var highTauCount = allTau.filter(function(t) { return t > 30; }).length;
    if (highTauCount === allTau.length && allTau.length >= 2) {
      faults.push({ zone: 'All zones', type: 'System-wide slow response',
        detail: 'All zones \u03c4 > 30min — possible refrigerant charge issue or undersized equipment',
        severity: 'warning' });
    }

    return faults;
  }

  function renderFOPDT() {
    try {
      if (!window._fopdtResults) return;
      var panel = document.getElementById('fopdtPanel');
      if (!panel) {
        var ref = document.getElementById('extrasPanel');
        if (!ref) return;
        panel = document.createElement('div');
        panel.id = 'fopdtPanel';
        ref.parentNode.insertBefore(panel, ref.nextSibling);
      }

      var results = window._fopdtResults;
      var faults = classifyFaults(results);

      var html = '<div class="card" style="margin-bottom:12px"><h2 class="card-title">HVAC RESPONSE (FOPDT)</h2>';

      // Main table — numbers first
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.9em">';
      html += '<tr style="opacity:0.6;font-size:0.8em">' +
        '<td>Zone</td>' +
        '<td style="text-align:right">\u03c4 (min)</td>' +
        '<td style="text-align:right">Gain (\u00b0F)</td>' +
        '<td style="text-align:right">Delay (min)</td>' +
        '<td style="text-align:right">Events</td></tr>';

      // Find averages for color-coding
      var meanTau = results.reduce(function(s,r){return s+r.tau;},0) / results.length;

      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var tauColor = r.tau > meanTau * 1.5 ? 'var(--dg)' : r.tau > meanTau * 1.2 ? 'var(--wn)' : 'var(--ok)';
        var lColor = r.L > 5 ? 'var(--wn)' : 'var(--ok)';

        html += '<tr>' +
          '<td>' + r.zone + '</td>' +
          '<td style="text-align:right;font-weight:600;color:' + tauColor + '">' + r.tau.toFixed(1) + '</td>' +
          '<td style="text-align:right">' + r.K.toFixed(1) + '</td>' +
          '<td style="text-align:right;color:' + lColor + '">' + r.L.toFixed(1) + '</td>' +
          '<td style="text-align:right;opacity:0.6">' + r.eventCount + '</td></tr>';
      }
      html += '</table>';

      // Fault flags — clear, actionable
      if (faults.length > 0) {
        html += '<div style="margin-top:8px;padding:6px;background:var(--sd);border-radius:4px">';
        for (var fi = 0; fi < faults.length; fi++) {
          var f = faults[fi];
          var icon = f.severity === 'warning' ? '\u26a0\ufe0f' : '\u2139\ufe0f';
          html += '<div style="margin-bottom:4px;font-size:0.85em">' +
            icon + ' <strong>' + f.zone + '</strong>: ' + f.type +
            ' <span style="opacity:0.6">(' + f.detail + ')</span></div>';
        }
        html += '</div>';
      }

      // Education behind toggle
      html += '<details style="margin-top:8px;font-size:0.75em;opacity:0.6"><summary style="cursor:pointer">\u2139\ufe0f What do these numbers mean?</summary>' +
        '<p style="margin:4px 0"><b>\u03c4 (time constant)</b>: How many minutes until the zone reaches 63% of its final temp after HVAC turns on. ' +
        'Lower = faster response. If one zone is much higher than others, its damper may be restricted.</p>' +
        '<p style="margin:4px 0"><b>Gain</b>: Total temperature rise (\u00b0F) achieved per heating cycle. ' +
        'Low gain = insufficient heating delivery to that zone.</p>' +
        '<p style="margin:4px 0"><b>Delay</b>: Minutes after HVAC starts before temperature begins rising. ' +
        'High delay in one zone suggests valve or damper actuation problems.</p>' +
        '<table style="width:100%;font-size:0.95em;margin-top:6px;border-collapse:collapse">' +
        '<tr style="font-weight:600"><td></td><td>Damper stuck</td><td>Refrigerant leak</td><td>EEV failure</td></tr>' +
        '<tr><td>\u03c4</td><td>\u2191\u2191 one zone</td><td>\u2191 all zones</td><td>\u2191 moderate</td></tr>' +
        '<tr><td>Gain</td><td>\u2193\u2193</td><td>\u2193 gradual</td><td>\u2193</td></tr>' +
        '<tr><td>Delay</td><td>Normal</td><td>Normal</td><td>\u2191\u2191</td></tr>' +
        '</table></details>';

      html += '</div>';
      panel.innerHTML = html;
    } catch (e) { console.warn('[FOPDT] render error:', e); }
  }

  // Run on interval
  computeFOPDT();
  setInterval(computeFOPDT, 300000);

  // Watch for data refresh
  var ag = document.getElementById('analysisGrid');
  if (ag) new MutationObserver(function() {
    setTimeout(computeFOPDT, 200);
  }).observe(ag, { childList: true });
})();

// === PERFORMANCE RATIO — Japanese SHASE Method ===
// Compares heating rate when ONE zone is active vs ALL zones active.
// PR = P_multi / P_single
//
// PR ≈ 1.0 but performance still poor → damper fault (equipment has
//   capacity, delivery is broken)
// PR ≪ 1.0 (e.g. 0.5) → outdoor unit capacity shortage (equipment
//   can't serve all zones simultaneously)
//
// This is the "equipment broken vs equipment undersized" distinction.

(function() {
  if (window._prInit) return;
  window._prInit = true;
  window._prResults = null;

  function computePR() {
    try {
      if (!lastData || !lastData.diagnostics) return;

      var zones = lastData.zones;
      var diagResults = lastData.diagnostics.zoneResults;
      if (!diagResults || diagResults.length < 2) return;

      // Build a timeline of which zones are "on" at each 5-min bucket
      // A zone is "on" if it's in a heating segment at that time
      var allBuckets = new Map(); // bucketKey → { zonesOn: Set, rates: { zoneId: rate } }

      for (var zi = 0; zi < zones.length; zi++) {
        var zone = zones[zi];
        var diag = diagResults.find(function(d) { return d.zoneId === zone.id; });
        if (!diag || !diag.segments) continue;

        var ts = zone.timeSeries;
        if (!ts || ts.length < 6) continue;

        for (var si = 0; si < diag.segments.length; si++) {
          var seg = diag.segments[si];
          if (!seg.on) continue;
          var durMin = (seg.endTs - seg.startTs) / 60000;
          if (durMin < 10) continue;

          // Heating rate for this segment (°F/hr)
          var rate = (seg.endTemp - seg.startTemp) / (durMin / 60);
          if (rate < 0.1) continue; // not meaningfully heating

          // Mark each 5-min bucket in this segment
          var startBucket = Math.floor(seg.startTs.getTime() / 300000);
          var endBucket = Math.floor(seg.endTs.getTime() / 300000);
          for (var b = startBucket; b <= endBucket; b++) {
            if (!allBuckets.has(b)) allBuckets.set(b, { zonesOn: new Set(), rates: {} });
            var bucket = allBuckets.get(b);
            bucket.zonesOn.add(zone.id);
            bucket.rates[zone.id] = rate;
          }
        }
      }

      // Classify buckets: single-zone vs multi-zone
      var singleRates = {}; // zoneId → [rates]
      var multiRates = {};  // zoneId → [rates]

      allBuckets.forEach(function(bucket) {
        var count = bucket.zonesOn.size;
        bucket.zonesOn.forEach(function(zid) {
          if (count === 1) {
            if (!singleRates[zid]) singleRates[zid] = [];
            singleRates[zid].push(bucket.rates[zid]);
          } else {
            if (!multiRates[zid]) multiRates[zid] = [];
            multiRates[zid].push(bucket.rates[zid]);
          }
        });
      });

      // Compute PR per zone
      var results = [];
      for (var zi2 = 0; zi2 < zones.length; zi2++) {
        var zid = zones[zi2].id;
        var sRates = singleRates[zid];
        var mRates = multiRates[zid];

        if ((!sRates || sRates.length < 2) && (!mRates || mRates.length < 2)) continue;

        var pSingle = sRates && sRates.length >= 2 ?
          sRates.reduce(function(a,b){return a+b;},0) / sRates.length : null;
        var pMulti = mRates && mRates.length >= 2 ?
          mRates.reduce(function(a,b){return a+b;},0) / mRates.length : null;

        var pr = (pSingle && pMulti && pSingle > 0.1) ? pMulti / pSingle : null;

        results.push({
          zone: zones[zi2].name,
          zoneId: zid,
          pSingle: pSingle ? Math.round(pSingle * 100) / 100 : null,
          pMulti: pMulti ? Math.round(pMulti * 100) / 100 : null,
          pr: pr ? Math.round(pr * 100) / 100 : null,
          singleBuckets: sRates ? sRates.length : 0,
          multiBuckets: mRates ? mRates.length : 0
        });
      }

      window._prResults = results.length > 0 ? results : null;

      if (results.length > 0) {
        console.log('[PR] Performance Ratio:', results.map(function(r) {
          return r.zone + ': single=' + (r.pSingle||'?') + ' multi=' + (r.pMulti||'?') + ' PR=' + (r.pr||'?');
        }).join(', '));
        renderPR();
      } else {
        console.log('[PR] Not enough single/multi zone heating data yet');
      }
    } catch (e) { console.warn('[PR] compute error:', e); }
  }

  function renderPR() {
    try {
      if (!window._prResults) return;
      var panel = document.getElementById('prPanel');
      if (!panel) {
        // Insert after FOPDT panel, or after extras panel
        var ref = document.getElementById('fopdtPanel') || document.getElementById('extrasPanel');
        if (!ref) return;
        panel = document.createElement('div');
        panel.id = 'prPanel';
        ref.parentNode.insertBefore(panel, ref.nextSibling);
      }

      var results = window._prResults;
      var html = '<div class="card" style="margin-bottom:12px"><h2 class="card-title">PERFORMANCE RATIO</h2>';

      html += '<table style="width:100%;border-collapse:collapse;font-size:0.9em">';
      html += '<tr style="opacity:0.6;font-size:0.8em">' +
        '<td>Zone</td>' +
        '<td style="text-align:right">Alone (\u00b0F/hr)</td>' +
        '<td style="text-align:right">Shared (\u00b0F/hr)</td>' +
        '<td style="text-align:right">Ratio</td>' +
        '<td style="text-align:right">Verdict</td></tr>';

      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var verdict = '', color = '';

        if (r.pr != null) {
          if (r.pr >= 0.85) {
            verdict = 'Delivery fault';
            color = 'var(--wn)';
          } else if (r.pr >= 0.6) {
            verdict = 'Moderate contention';
            color = 'var(--wn)';
          } else {
            verdict = 'Undersized';
            color = 'var(--dg)';
          }
          // Special case: PR near 1 and rates are good = system OK for this zone
          if (r.pr >= 0.85 && r.pMulti && r.pMulti > 1.0) {
            verdict = 'OK';
            color = 'var(--ok)';
          }
        } else {
          verdict = 'Insufficient data';
          color = 'var(--tm)';
        }

        html += '<tr>' +
          '<td>' + r.zone + '</td>' +
          '<td style="text-align:right">' + (r.pSingle != null ? r.pSingle.toFixed(1) : '\u2014') + '</td>' +
          '<td style="text-align:right">' + (r.pMulti != null ? r.pMulti.toFixed(1) : '\u2014') + '</td>' +
          '<td style="text-align:right;font-weight:600">' + (r.pr != null ? r.pr.toFixed(2) : '\u2014') + '</td>' +
          '<td style="text-align:right;font-weight:600;color:' + color + '">' + verdict + '</td></tr>';
      }
      html += '</table>';

      // System-wide summary
      var prs = results.filter(function(r) { return r.pr != null; }).map(function(r) { return r.pr; });
      if (prs.length >= 2) {
        var avgPR = prs.reduce(function(a,b){return a+b;},0) / prs.length;
        var sysVerdict, sysColor;
        if (avgPR < 0.6) {
          sysVerdict = 'Equipment likely undersized \u2014 can\u2019t serve all zones simultaneously';
          sysColor = 'var(--dg)';
        } else if (avgPR >= 0.85) {
          sysVerdict = 'Equipment has capacity \u2014 delivery/damper issue more likely';
          sysColor = 'var(--wn)';
        } else {
          sysVerdict = 'Moderate capacity contention across zones';
          sysColor = 'var(--wn)';
        }
        html += '<div style="margin-top:8px;padding:6px;background:var(--sd);border-radius:4px;font-size:0.85em">' +
          '<strong>System:</strong> avg PR = ' + avgPR.toFixed(2) + ' \u2014 ' +
          '<span style="color:' + sysColor + '">' + sysVerdict + '</span></div>';
      }

      html += '<details style="margin-top:8px;font-size:0.75em;opacity:0.6"><summary style="cursor:pointer">\u2139\ufe0f What is Performance Ratio?</summary>' +
        '<p style="margin:4px 0"><b>Alone</b>: Heating rate when only this zone\u2019s HVAC is running.</p>' +
        '<p style="margin:4px 0"><b>Shared</b>: Heating rate when multiple zones run simultaneously.</p>' +
        '<p style="margin:4px 0"><b>Ratio</b> = Shared \u00f7 Alone. Tells you why performance is poor:</p>' +
        '<p style="margin:4px 0">PR \u2248 1.0 but still slow \u2192 the equipment has capacity, but delivery (dampers/ductwork) is broken.</p>' +
        '<p style="margin:4px 0">PR \u226a 1.0 (e.g. 0.5) \u2192 the outdoor unit can\u2019t serve all zones at once. Equipment is undersized.</p>' +
        '<p style="margin:4px 0">This is the difference between telling your landlord "it\u2019s broken" vs "it\u2019s too small."</p>' +
        '</details>';

      html += '</div>';
      panel.innerHTML = html;
    } catch (e) { console.warn('[PR] render error:', e); }
  }

  computePR();
  setInterval(computePR, 300000);

  var ag = document.getElementById('analysisGrid');
  if (ag) new MutationObserver(function() {
    setTimeout(computePR, 300);
  }).observe(ag, { childList: true });
})();
