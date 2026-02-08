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

// === SIDS THERMAL SAFETY MONITOR v3 — standalone interval, no wrapping ===
// Reads lastData directly every 10 seconds. No function wrapping needed.
//
// EVIDENCE BASE:
//   AAP 2022 (Pediatrics, e2022057990): 68-72F recommended
//   Cleveland Clinic: 65-70F recommended
//   PMC (PMC9051231): thermal stress as continuous SIDS risk factor
//   Multiple sources flag 75F (24C) as overheating onset
//   Japanese pediatric guidelines: 18-20C (64-68F)
//
// TIERS (30 min sustained): INFO >72F, WARNING >75F, DANGER >78F

window._sidsLog = window._sidsLog || [];

setInterval(function() {
  if (typeof lastData === 'undefined' || !lastData || !lastData.zones) return;

  var master = lastData.zones.find(function(z) { return z.id === 'master'; });
  if (!master || !master.timeSeries || master.timeSeries.length < 3) return;

  var now = Date.now();
  var cutoff30 = now - 30 * 60000;
  var recent = master.timeSeries.filter(function(p) { return p.ts.getTime() >= cutoff30; });
  if (recent.length < 3) return;

  var hour = new Date().getHours();
  var isNight = (hour >= 22 || hour < 6);
  var minTemp = Math.min.apply(null, recent.map(function(p) { return p.temp; }));
  var avgTemp = recent.reduce(function(s, p) { return s + p.temp; }, 0) / recent.length;

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

  // === ANOMALY BANNER ===
  var ab = document.getElementById('anomalyBanner');
  var sidsBanner = document.getElementById('sidsBanner');
  if (tier && tierLabel) {
    if (!sidsBanner) {
      sidsBanner = document.createElement('div');
      sidsBanner.id = 'sidsBanner';
      sidsBanner.className = 'anomaly-banner';
      if (ab) ab.parentNode.insertBefore(sidsBanner, ab);
      else {
        var dash = document.querySelector('.dashboard');
        if (dash) dash.insertBefore(sidsBanner, dash.children[1]);
      }
    }
    sidsBanner.innerHTML = '<div class="anomaly-item" data-level="' + tierLevel + '">' + tierLabel + '</div>';
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
    var temp = master.avgTemp != null ? master.avgTemp.toFixed(1) + '\u00b0F' : '?';
    var dot, label;
    if (tier === 'DANGER') { dot = '\ud83d\udd34'; label = 'SIDS DANGER'; }
    else if (tier === 'WARNING') { dot = '\ud83d\udfe1'; label = 'SIDS WARNING'; }
    else if (tier === 'INFO') { dot = '\ud83d\udfe0'; label = 'SIDS above range'; }
    else if (isNight) { dot = '\ud83d\udfe2'; label = 'SIDS monitor OK'; }
    else { dot = '\u26aa'; label = 'SIDS monitor'; }
    var logNote = window._sidsLog.length > 0 ? ' \u00b7 ' + window._sidsLog.length + ' event(s)' : '';
    existing.innerHTML = dot + ' ' + label + ' (Master: ' + temp + ')' + logNote;
  }

  // === LOG WARNING/DANGER ===
  if (tier && tier !== 'INFO') {
    var last = window._sidsLog[window._sidsLog.length - 1];
    var shouldLog = !last || last.tier !== tier || (now - new Date(last.timestamp).getTime()) > 600000;
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
}, 10000);

// === SIDS LOG EXPORT ===
window._exportSidsLog = function() {
  var blob = new Blob([JSON.stringify(window._sidsLog, null, 2)], {type: 'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sids-log-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};
