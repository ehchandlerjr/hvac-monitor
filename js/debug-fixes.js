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

// === S2 DYNAMIC SETPOINT — Finnish Sisäilmastoluokitus 2018 ===
// Source: VTT/Tampere/Aalto indoor climate classification
// S2 ("good" tier) target = 21.5 + 0.2 × max(0, min(T_out_24h_C, 20)) °C
// S2 allowed band: target ±1.0°C (±1.8°F)
//
// Computes dynamic reference line from 24h outdoor temp rolling average.
// Drawn on time-series chart alongside thermostat setpoint.
// Key insight: tells landlord "given outdoor conditions, a well-performing
// building should hold X°F — yours is overshooting/undershooting by Y°F."

window._s2 = null;

// Wrap refresh() to also fetch weather history for S2 computation
var _origRefresh = refresh;
refresh = async function() {
  await _origRefresh();
  try {
    var wh = await fetchWeatherHistory();
    if (wh && wh.length > 0) {
      var sum = 0, n = 0;
      for (var i = 0; i < wh.length; i++) {
        if (wh[i].outdoor_temp_f != null) {
          sum += wh[i].outdoor_temp_f;
          n++;
        }
      }
      if (n > 0) {
        var avgOutF = sum / n;
        var avgOutC = (avgOutF - 32) * 5 / 9;
        var s2C = 21.5 + 0.2 * Math.max(0, Math.min(avgOutC, 20));
        var s2F = s2C * 9 / 5 + 32;
        window._s2 = {
          targetF: Math.round(s2F * 10) / 10,
          targetC: Math.round(s2C * 10) / 10,
          lowF: Math.round((s2C - 1) * 9 / 5 + 32 * 10) / 10,
          highF: Math.round(((s2C + 1.5) * 9 / 5 + 32) * 10) / 10,
          outdoorAvgF: Math.round(avgOutF * 10) / 10,
          outdoorAvgC: Math.round(avgOutC * 10) / 10,
          readings: n
        };
        // Fix low calc
        window._s2.lowF = Math.round(((s2C - 1) * 9 / 5 + 32) * 10) / 10;
        console.log('[S2] Outdoor 24h avg: ' + avgOutF.toFixed(1) + '°F (' + avgOutC.toFixed(1) + '°C) → S2 target: ' + s2F.toFixed(1) + '°F (' + s2C.toFixed(1) + '°C) from ' + n + ' readings');
      }
    }
  } catch (e) {
    console.warn('[S2] Weather history fetch failed:', e);
  }
};

// Wrap renderChart() to add S2 reference line
var _origRenderChart = renderChart;
renderChart = function(zones, hours, diagnostics) { try {
  _origRenderChart(zones, hours, diagnostics);
  if (!window._s2) return;

  var container = document.getElementById('tsChart');
  if (!container) return;
  var svg = container.querySelector('svg');
  if (!svg) return;

  var s2 = window._s2;

  // Reconstruct scale functions from the SVG (same logic as renderChart)
  var cutoff = new Date(Date.now() - hours * 3600000);
  var series = zones.map(function(z) {
    return z.timeSeries.filter(function(p) { return p.ts >= cutoff; });
  }).filter(function(d) { return d.length > 0; });

  if (series.length === 0) return;

  var allT = [];
  var allTs = [];
  for (var i = 0; i < series.length; i++) {
    for (var j = 0; j < series[i].length; j++) {
      allT.push(series[i][j].temp);
      allTs.push(series[i][j].ts.getTime());
    }
  }

  var tMin = Math.floor(Math.min.apply(null, allT) - 1);
  var tMax = Math.ceil(Math.max.apply(null, allT) + 1);
  var W = 1000, P_l = 50, P_t = 20, P_r = 12, P_b = 30;
  var pW = W - P_l - P_r, pH = 200 - P_t - P_b;

  function sy(t) { return P_t + pH - ((t - tMin) / (tMax - tMin || 1)) * pH; }

  // Only draw if S2 target is within visible range
  if (s2.targetF < tMin - 2 || s2.targetF > tMax + 2) return;

  // S2 allowed band (target ±1°C = ±1.8°F)
  var bandLow = s2.lowF;
  var bandHigh = s2.highF;
  var bandRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bandRect.setAttribute('x', P_l);
  bandRect.setAttribute('y', sy(Math.min(bandHigh, tMax)));
  bandRect.setAttribute('width', pW);
  bandRect.setAttribute('height', Math.max(0, sy(Math.max(bandLow, tMin)) - sy(Math.min(bandHigh, tMax))));
  bandRect.setAttribute('fill', '#2196F3');
  bandRect.setAttribute('opacity', '0.06');
  // Insert before data lines (after grid)
  var firstPolyline = svg.querySelector('polyline');
  if (firstPolyline) {
    svg.insertBefore(bandRect, firstPolyline);
  } else {
    svg.appendChild(bandRect);
  }

  // S2 target line (solid, blue-ish)
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', P_l);
  line.setAttribute('y1', sy(s2.targetF));
  line.setAttribute('x2', W - P_r);
  line.setAttribute('y2', sy(s2.targetF));
  line.setAttribute('stroke', '#2196F3');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '8,3');
  line.setAttribute('opacity', '0.7');
  if (firstPolyline) {
    svg.insertBefore(line, firstPolyline);
  } else {
    svg.appendChild(line);
  }

  // S2 label
  var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', W - P_r - 4);
  label.setAttribute('y', sy(s2.targetF) - 4);
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('fill', '#2196F3');
  label.setAttribute('font-size', '9');
  label.setAttribute('opacity', '0.8');
  label.textContent = 'S2 ' + s2.targetF.toFixed(1) + '°F';
  svg.appendChild(label);

  // Add S2 info to legend
  var legendEl = document.getElementById('tsLegend');
  if (legendEl) {
    legendEl.innerHTML += '<div class="legend-item" style="opacity:0.8">' +
      '<span class="legend-swatch" style="background:#2196F3"></span>' +
      'S2 target (' + s2.targetF.toFixed(1) + '°F) · Out avg: ' + s2.outdoorAvgF.toFixed(1) + '°F</div>';
  }
} catch(e) { console.warn("[S2] renderChart overlay error:", e); } };

// Wrap renderAnalysis to add S2 deviation metric
var _origRenderAnalysis = renderAnalysis;
renderAnalysis = function(zones, weather, spread, anomalies, diagnostics) { try {
  _origRenderAnalysis(zones, weather, spread, anomalies, diagnostics);
  if (!window._s2) return;
  var panel = document.getElementById('analysisPanel');
  if (!panel) return;
  var s2 = window._s2;

  // Compute per-zone deviation from S2
  var deviations = [];
  for (var i = 0; i < zones.length; i++) {
    if (zones[i].avgTemp != null) {
      var dev = zones[i].avgTemp - s2.targetF;
      deviations.push(zones[i].name + ': ' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '°F');
    }
  }

  if (deviations.length > 0) {
    var div = document.createElement('div');
    div.className = 'metric-row';
    div.innerHTML = '<div class="metric-row"><span class="metric-label">S2 deviation</span>' +
      '<span class="metric-value" style="font-size:0.85em">' + deviations.join(' · ') + '</span></div>' +
      '<div class="metric-row"><span class="metric-label" style="opacity:0.6;font-size:0.8em">' +
      'Finnish S2 target: ' + s2.targetF.toFixed(1) + '°F (' + s2.targetC.toFixed(1) + '°C) · ' +
      'Outdoor 24h avg: ' + s2.outdoorAvgF.toFixed(1) + '°F · ' + s2.readings + ' readings</span></div>';
    panel.appendChild(div);
  }
} catch(e) { console.warn("[S2] renderAnalysis error:", e); } };

// === S2 DYNAMIC SETPOINT — Finnish Sisäilmastoluokitus 2018 ===
// Source: VTT/Tampere/Aalto indoor climate classification
// S2 ("good" tier) target = 21.5 + 0.2 × max(0, min(T_out_24h_C, 20)) °C
// S2 allowed band: target ±1.0°C (low) / +1.5°C (high)
//
// Computes dynamic reference line from 24h outdoor temp rolling average.
// Drawn on time-series chart alongside thermostat setpoint.
// Key insight: tells landlord "given outdoor conditions, a well-performing
// building should hold X°F — yours is overshooting/undershooting by Y°F."

window._s2 = null;

// Wrap refresh() to also fetch weather history for S2 computation
var _origRefresh = refresh;
refresh = async function() {
  await _origRefresh();
  try {
    var wh = await fetchWeatherHistory();
    if (wh && wh.length > 0) {
      var sum = 0, n = 0;
      for (var i = 0; i < wh.length; i++) {
        if (wh[i].outdoor_temp_f != null) {
          sum += wh[i].outdoor_temp_f;
          n++;
        }
      }
      if (n > 0) {
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
        console.log('[S2] Outdoor 24h avg: ' + avgOutF.toFixed(1) + '°F (' + avgOutC.toFixed(1) + '°C) → S2 target: ' + s2F.toFixed(1) + '°F (' + s2C.toFixed(1) + '°C) from ' + n + ' readings');
      }
    }
  } catch (e) {
    console.warn('[S2] Weather history fetch failed:', e);
  }
};

// Wrap renderChart() to add S2 reference line
var _origRenderChart = renderChart;
renderChart = function(zones, hours, diagnostics) { try {
  _origRenderChart(zones, hours, diagnostics);
  if (!window._s2) return;

  var container = document.getElementById('tsChart');
  if (!container) return;
  var svg = container.querySelector('svg');
  if (!svg) return;

  var s2 = window._s2;

  // Reconstruct scale functions from the SVG (same logic as renderChart)
  var cutoff = new Date(Date.now() - hours * 3600000);
  var series = zones.map(function(z) {
    return z.timeSeries.filter(function(p) { return p.ts >= cutoff; });
  }).filter(function(d) { return d.length > 0; });

  if (series.length === 0) return;

  var allT = [];
  var allTs = [];
  for (var i = 0; i < series.length; i++) {
    for (var j = 0; j < series[i].length; j++) {
      allT.push(series[i][j].temp);
      allTs.push(series[i][j].ts.getTime());
    }
  }

  var tMin = Math.floor(Math.min.apply(null, allT) - 1);
  var tMax = Math.ceil(Math.max.apply(null, allT) + 1);
  var W = 1000, P_l = 50, P_t = 20, P_r = 12, P_b = 30;
  var pW = W - P_l - P_r, pH = 200 - P_t - P_b;

  function sy(t) { return P_t + pH - ((t - tMin) / (tMax - tMin || 1)) * pH; }

  // Only draw if S2 target is within visible range
  if (s2.targetF < tMin - 2 || s2.targetF > tMax + 2) return;

  // S2 allowed band
  var bandLow = s2.lowF;
  var bandHigh = s2.highF;
  var bandRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bandRect.setAttribute('x', P_l);
  bandRect.setAttribute('y', sy(Math.min(bandHigh, tMax)));
  bandRect.setAttribute('width', pW);
  bandRect.setAttribute('height', Math.max(0, sy(Math.max(bandLow, tMin)) - sy(Math.min(bandHigh, tMax))));
  bandRect.setAttribute('fill', '#2196F3');
  bandRect.setAttribute('opacity', '0.06');
  var firstPolyline = svg.querySelector('polyline');
  if (firstPolyline) {
    svg.insertBefore(bandRect, firstPolyline);
  } else {
    svg.appendChild(bandRect);
  }

  // S2 target line
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', P_l);
  line.setAttribute('y1', sy(s2.targetF));
  line.setAttribute('x2', W - P_r);
  line.setAttribute('y2', sy(s2.targetF));
  line.setAttribute('stroke', '#2196F3');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '8,3');
  line.setAttribute('opacity', '0.7');
  if (firstPolyline) {
    svg.insertBefore(line, firstPolyline);
  } else {
    svg.appendChild(line);
  }

  // S2 label
  var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', W - P_r - 4);
  label.setAttribute('y', sy(s2.targetF) - 4);
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('fill', '#2196F3');
  label.setAttribute('font-size', '9');
  label.setAttribute('opacity', '0.8');
  label.textContent = 'S2 ' + s2.targetF.toFixed(1) + '°F';
  svg.appendChild(label);

  // Add S2 info to legend
  var legendEl = document.getElementById('tsLegend');
  if (legendEl) {
    legendEl.innerHTML += '<div class="legend-item" style="opacity:0.8">' +
      '<span class="legend-swatch" style="background:#2196F3"></span>' +
      'S2 target (' + s2.targetF.toFixed(1) + '°F) · Out avg: ' + s2.outdoorAvgF.toFixed(1) + '°F</div>';
  }
} catch(e) { console.warn("[S2] renderChart overlay error:", e); } };

// Wrap renderAnalysis to add S2 deviation metric
var _origRenderAnalysis = renderAnalysis;
renderAnalysis = function(zones, weather, spread, anomalies, diagnostics) { try {
  _origRenderAnalysis(zones, weather, spread, anomalies, diagnostics);
  if (!window._s2) return;
  var panel = document.getElementById('analysisPanel');
  if (!panel) return;
  var s2 = window._s2;

  var deviations = [];
  for (var i = 0; i < zones.length; i++) {
    if (zones[i].avgTemp != null) {
      var dev = zones[i].avgTemp - s2.targetF;
      deviations.push(zones[i].name + ': ' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '°F');
    }
  }

  if (deviations.length > 0) {
    var div = document.createElement('div');
    div.className = 'metric-row';
    div.innerHTML = '<div class="metric-row"><span class="metric-label">S2 deviation</span>' +
      '<span class="metric-value" style="font-size:0.85em">' + deviations.join(' · ') + '</span></div>' +
      '<div class="metric-row"><span class="metric-label" style="opacity:0.6;font-size:0.8em">' +
      'Finnish S2 target: ' + s2.targetF.toFixed(1) + '°F (' + s2.targetC.toFixed(1) + '°C) · ' +
      'Outdoor 24h avg: ' + s2.outdoorAvgF.toFixed(1) + '°F · ' + s2.readings + ' readings</span></div>';
    panel.appendChild(div);
  }
} catch(e) { console.warn("[S2] renderAnalysis error:", e); } };
