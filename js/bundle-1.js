// ══════════════════════════════════════════════════════════════
// HVAC THERMAL MONITOR — Four Modes of Claritas (v2)
// "Ad pulchritudinem tria requiruntur" — S.T. I, Q. 39, Art. 8
// ══════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://pbidxylxpolvddukhxlr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWR4eWx4cG9sdmRkdWtoeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTM2NTcsImV4cCI6MjA4NTk2OTY1N30.zgCiG43jKnD3v1aKXfWh929I47GnvdkRYs0pOSc6EFo';
const TABLE = 'readings';
const POLL_MS = 300000;
const HISTORY_HOURS = 168; // 7 days for carpet plot
const STALE_MINUTES = 120;
const SETPOINT = 70; // assumed setpoint °F
const DERIVATIVE_THRESHOLD = 0.05; // °F per 5-min for HVAC cycle detection

const ZONES = [
  {
    id: 'teddys_room', name: "Teddy's Room", hvac: 'boys_rooms', floor: 3,
    adjacent: ['eliots_room', 'master'],
    sensors: [{ id: "teddy's_room___sensor___temperature_and_relative_humidity", label: "Teddy's Sensor" }],
    svg: { x: 10, y: 10, w: 180, h: 130, cx: 100 },
  },
  {
    id: 'eliots_room', name: "Eliot's Room", hvac: 'boys_rooms', floor: 3,
    adjacent: ['teddys_room', 'master'],
    sensors: [{ id: "eliot's_room___sensor___temperature_and_relative_humidity", label: "Eliot's Sensor" }],
    svg: { x: 200, y: 10, w: 180, h: 130, cx: 290 },
  },
  {
    id: 'master', name: 'Master Bedroom', hvac: 'master', floor: 3,
    adjacent: ['teddys_room', 'eliots_room'],
    sensors: [{ id: 'master_bedroom___sensor___temperature_and_relative_humidity', label: 'Master Sensor' }],
    svg: { x: 10, y: 150, w: 180, h: 130, cx: 100 },
  },
  {
    id: 'play_room', name: 'Play Room', hvac: 'downstairs', floor: 1,
    adjacent: [],
    sensors: [
      { id: 'play_room___sensor___temperature_and_relative_humidity', label: 'Play Room Sensor' },
      { id: 'multipurpose_sensor', label: 'Multipurpose' },
    ],
    svg: { x: 200, y: 150, w: 180, h: 130, cx: 290 },
  },
];

const THEMES = ['vellum', 'tenebrae', 'lauds', 'scriptorium'];
const THEME_LABELS = { vellum: 'Vellum', tenebrae: 'Tenebrae', lauds: 'Lauds', scriptorium: 'Scriptorium' };

// ── SUPABASE ─────────────────────────────────────────────────
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

async function fetchReadings() {
  const since = new Date(Date.now() - HISTORY_HOURS * 3600000).toISOString();
  const url = SUPABASE_URL + '/rest/v1/' + TABLE +
    '?timestamp=gte.' + since +
    '&temp_f=not.is.null' +
    '&sensor_id=neq.outdoor_weather' +
    '&select=sensor_id,timestamp,temp_f,humidity_pct,battery_pct' +
    '&order=timestamp.asc&limit=50000';
  const r = await fetch(url, { headers });
  return r.ok ? r.json() : [];
}

async function fetchWeather() {
  const url = SUPABASE_URL + '/rest/v1/' + TABLE +
    '?sensor_id=eq.outdoor_weather' +
    '&outdoor_temp_f=not.is.null' +
    '&select=timestamp,outdoor_temp_f,outdoor_humidity_pct,wind_speed_mph,wind_gust_mph,wind_direction_deg,cloud_cover_pct,dewpoint_f,pressure_inhg,precip_last_hour_in' +
    '&order=timestamp.desc&limit=1';
  const r = await fetch(url, { headers });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function fetchWeatherHistory() {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const url = SUPABASE_URL + '/rest/v1/' + TABLE +
    '?sensor_id=eq.outdoor_weather' +
    '&outdoor_temp_f=not.is.null' +
    '&select=timestamp,outdoor_temp_f,wind_speed_mph' +
    '&order=timestamp.asc&limit=500' +
    '&timestamp=gte.' + since;
  const r = await fetch(url, { headers });
  return r.ok ? r.json() : [];
}

// ── THEME ENGINE ─────────────────────────────────────────────
function applyTheme(id) {
  document.body.className = 't-' + id;
  try { localStorage.setItem('hvac-theme', id); } catch {}
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === id)
  );
}

// ── DIAGNOSTIC ENGINE ────────────────────────────────────────

/** 3-sample moving average */
function smooth(arr) {
  if (arr.length < 3) return arr.slice();
  const out = [arr[0]];
  for (let i = 1; i < arr.length - 1; i++) {
    out.push((arr[i - 1] + arr[i] + arr[i + 1]) / 3);
  }
  out.push(arr[arr.length - 1]);
  return out;
}

/** Central difference derivative (°F per 5-min interval) */
function derivative(temps) {
  const d = [0];
  for (let i = 1; i < temps.length - 1; i++) {
    d.push((temps[i + 1] - temps[i - 1]) / 2);
  }
  d.push(0);
  return d;
}

/** Detect HVAC on/off cycles from smoothed temperature derivative */
function detectCycles(timeSeries) {
  if (timeSeries.length < 6) return { cycles: [], dutyCycle: null, segments: [] };
  const temps = smooth(timeSeries.map(p => p.temp));
  const deriv = derivative(temps);
  const segments = []; // { start, end, on: bool }
  let isOn = deriv[1] > DERIVATIVE_THRESHOLD;
  let segStart = 0;

  for (let i = 1; i < deriv.length; i++) {
    const nowOn = deriv[i] > DERIVATIVE_THRESHOLD;
    if (nowOn !== isOn) {
      segments.push({
        startTs: timeSeries[segStart].ts,
        endTs: timeSeries[i].ts,
        on: isOn,
        startTemp: temps[segStart],
        endTemp: temps[i],
      });
      segStart = i;
      isOn = nowOn;
    }
  }
  segments.push({
    startTs: timeSeries[segStart].ts,
    endTs: timeSeries[timeSeries.length - 1].ts,
    on: isOn,
    startTemp: temps[segStart],
    endTemp: temps[temps.length - 1],
  });

  // Duty cycle (last 24h)
  const cutoff24 = Date.now() - 24 * 3600000;
  let onTime = 0, totalTime = 0;
  for (const seg of segments) {
    const s = Math.max(seg.startTs.getTime(), cutoff24);
    const e = seg.endTs.getTime();
    if (e <= cutoff24) continue;
    const dur = e - s;
    totalTime += dur;
    if (seg.on) onTime += dur;
  }
  const dutyCycle = totalTime > 0 ? onTime / totalTime : null;

  // Recovery rates from "on" segments
  const cycles = [];
  for (const seg of segments) {
    if (!seg.on) continue;
    const durHrs = (seg.endTs - seg.startTs) / 3600000;
    if (durHrs < 0.05) continue; // skip tiny segments
    const recoveryRate = (seg.endTemp - seg.startTemp) / durHrs; // °F/hr
    cycles.push({ ...seg, recoveryRate, durHrs });
  }

  return { cycles, dutyCycle, segments };
}

/** Thermal drift rate during HVAC-off periods, normalized by indoor-outdoor ΔT */
function calcDriftRate(timeSeries, outdoorTemp) {
  if (!outdoorTemp || timeSeries.length < 6) return null;
  const temps = smooth(timeSeries.map(p => p.temp));
  const deriv = derivative(temps);

  // Find "off" periods (falling or stable temp, >15 min)
  let drifts = [];
  let offStart = null;
  for (let i = 0; i < deriv.length; i++) {
    if (deriv[i] < -DERIVATIVE_THRESHOLD) {
      if (offStart === null) offStart = i;
    } else {
      if (offStart !== null && i - offStart >= 3) {
        const dt = temps[i] - temps[offStart];
        const durHrs = (timeSeries[i].ts - timeSeries[offStart].ts) / 3600000;
        const avgTemp = (temps[offStart] + temps[i]) / 2;
        const deltaT = avgTemp - outdoorTemp;
        if (durHrs > 0 && Math.abs(deltaT) > 5) {
          drifts.push(Math.abs((dt / durHrs) / deltaT));
        }
      }
      offStart = null;
    }
  }
  if (drifts.length === 0) return null;
  return drifts.reduce((a, b) => a + b, 0) / drifts.length;
}

/** Thermal time constant τ from exponential decay fit during off periods */
function calcTau(timeSeries, outdoorTemp) {
  if (!outdoorTemp || timeSeries.length < 12) return null;
  const temps = smooth(timeSeries.map(p => p.temp));
  const deriv = derivative(temps);

  // Find longest off (decay) period
  let bestStart = -1, bestLen = 0, curStart = -1;
  for (let i = 0; i < deriv.length; i++) {
    if (deriv[i] < -DERIVATIVE_THRESHOLD * 0.5) {
      if (curStart === -1) curStart = i;
      if (i - curStart > bestLen) { bestStart = curStart; bestLen = i - curStart; }
    } else {
      curStart = -1;
    }
  }
  if (bestLen < 6) return null;

  // Fit T(t) = T_out + (T0 - T_out) * e^(-t/τ)
  // ln(T(t) - T_out) = ln(T0 - T_out) - t/τ → linear regression on log
  const t0 = timeSeries[bestStart].ts.getTime();
  const xs = [], ys = [];
  for (let i = bestStart; i < bestStart + bestLen; i++) {
    const diff = temps[i] - outdoorTemp;
    if (diff <= 0.5) continue;
    xs.push((timeSeries[i].ts.getTime() - t0) / 3600000);
    ys.push(Math.log(diff));
  }
  if (xs.length < 4) return null;

  // Linear regression
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sx2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sx2 - sx * sx;
  if (Math.abs(denom) < 1e-10) return null;
  const slope = (n * sxy - sx * sy) / denom;
  if (slope >= 0) return null; // should be negative
  return -1 / slope; // τ in hours
}

/** Inter-zone coupling coefficient */
function calcCoupling(zoneA_ts, zoneB_ts) {
  if (zoneA_ts.length < 6 || zoneB_ts.length < 6) return null;
  // Align on common 5-min buckets
  const mapA = new Map(), mapB = new Map();
  for (const p of zoneA_ts) mapA.set(Math.floor(p.ts.getTime() / 300000), p.temp);
  for (const p of zoneB_ts) mapB.set(Math.floor(p.ts.getTime() / 300000), p.temp);
  const common = [];
  for (const [k, tA] of mapA) {
    if (mapB.has(k)) common.push({ tA, tB: mapB.get(k) });
  }
  if (common.length < 10) return null;
  // Pearson correlation
  const n = common.length;
  const mA = common.reduce((s, c) => s + c.tA, 0) / n;
  const mB = common.reduce((s, c) => s + c.tB, 0) / n;
  let num = 0, dA = 0, dB = 0;
  for (const c of common) {
    const a = c.tA - mA, b = c.tB - mB;
    num += a * b; dA += a * a; dB += b * b;
  }
  const den = Math.sqrt(dA * dB);
  return den > 0 ? num / den : null;
}

/** Run full diagnostics on processed zone data */
function runDiagnostics(zones, weather) {
  const outdoorTemp = weather ? weather.tempF : null;
  const results = [];

  for (const z of zones) {
    const ts24 = z.timeSeries.filter(p => p.ts.getTime() > Date.now() - 24 * 3600000);
    const cycleData = detectCycles(ts24);
    const driftRate = calcDriftRate(ts24, outdoorTemp);
    const tau = calcTau(ts24, outdoorTemp);
    const avgRecovery = cycleData.cycles.length > 0
      ? cycleData.cycles.reduce((s, c) => s + c.recoveryRate, 0) / cycleData.cycles.length
      : null;

    results.push({
      zoneId: z.id, zoneName: z.name, hvac: z.hvac,
      dutyCycle: cycleData.dutyCycle,
      avgRecoveryRate: avgRecovery,
      driftRate: driftRate,
      tau: tau,
      segments: cycleData.segments,
      cycles: cycleData.cycles,
    });
  }

  // Coupling between all pairs
  const couplings = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const r = calcCoupling(zones[i].timeSeries, zones[j].timeSeries);
      couplings.push({ a: zones[i].name, b: zones[j].name, r: r });
    }
  }

  // Fault classification
  const faults = classifyFaults(results);

  return { zoneResults: results, couplings, faults };
}

/** Classify faults from diagnostic metrics */
function classifyFaults(zoneResults) {
  const faults = [];
  const sameHvac = {};
  for (const r of zoneResults) {
    if (!sameHvac[r.hvac]) sameHvac[r.hvac] = [];
    sameHvac[r.hvac].push(r);
  }

  for (const r of zoneResults) {
    // Duty cycle approaching 100% = zone can't satisfy
    if (r.dutyCycle !== null && r.dutyCycle > 0.85) {
      // Check if siblings in same HVAC group have low duty cycle
      const siblings = (sameHvac[r.hvac] || []).filter(s => s.zoneId !== r.zoneId);
      const siblingLow = siblings.some(s => s.dutyCycle !== null && s.dutyCycle < 0.4);

      if (siblingLow) {
        faults.push({
          zone: r.zoneName, level: 'danger',
          type: 'Damper imbalance',
          msg: r.zoneName + ' duty cycle ' + (r.dutyCycle * 100).toFixed(0) + '% while sibling zone is low — airflow likely diverted'
        });
      } else {
        faults.push({
          zone: r.zoneName, level: 'warning',
          type: 'Capacity shortage',
          msg: r.zoneName + ' duty cycle ' + (r.dutyCycle * 100).toFixed(0) + '% — may indicate undersized duct or high load'
        });
      }
    }

    // Low recovery rate compared to others
    const allRates = zoneResults.filter(z => z.avgRecoveryRate !== null).map(z => z.avgRecoveryRate);
    if (r.avgRecoveryRate !== null && allRates.length >= 2) {
      const median = allRates.sort((a, b) => a - b)[Math.floor(allRates.length / 2)];
      if (median > 0 && r.avgRecoveryRate < median * 0.4) {
        faults.push({
          zone: r.zoneName, level: 'warning',
          type: 'Slow recovery',
          msg: r.zoneName + ' recovers at ' + r.avgRecoveryRate.toFixed(1) + '°/hr vs median ' + median.toFixed(1) + '°/hr'
        });
      }
    }

    // High drift rate = envelope problem
    if (r.driftRate !== null && r.driftRate > 0.04) {
      faults.push({
        zone: r.zoneName, level: 'info',
        type: 'Elevated heat loss',
        msg: r.zoneName + ' normalized drift rate ' + (r.driftRate * 100).toFixed(1) + '%/hr — possible envelope issue'
      });
    }

    // Low τ = poor thermal mass or high infiltration
    if (r.tau !== null && r.tau < 3) {
      faults.push({
        zone: r.zoneName, level: 'warning',
        type: 'Low time constant',
        msg: r.zoneName + ' τ = ' + r.tau.toFixed(1) + 'h — room cools very fast, check air sealing'
      });
    }
  }

  return faults;
}

// ── DATA PROCESSING ──────────────────────────────────────────
function processData(rawReadings, rawWeather) {
  const zones = ZONES.map(zCfg => {
    const sensorData = zCfg.sensors.map(sCfg => {
      const readings = rawReadings
        .filter(r => r.sensor_id === sCfg.id)
        .map(r => ({ ts: new Date(r.timestamp), temp: r.temp_f, hum: r.humidity_pct, batt: r.battery_pct }))
        .sort((a, b) => a.ts - b.ts);
      const latest = readings[readings.length - 1] || null;
      const stale = latest ? (Date.now() - latest.ts) / 60000 > STALE_MINUTES : true;
      return { id: sCfg.id, label: sCfg.label, readings, latest, stale, online: !!latest };
    });

    const withData = sensorData.filter(s => s.latest);
    const temps = withData.map(s => s.latest.temp);
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const humidity = withData.length > 0 && withData[0].latest.hum != null ? withData[0].latest.hum : null;

    // Rate of change (last 60 min)
    let rate = null;
    const allReadings = sensorData.flatMap(s => s.readings);
    if (allReadings.length >= 2) {
      const cutoff = new Date(Date.now() - 60 * 60000);
      const recent = allReadings.filter(r => r.ts >= cutoff);
      if (recent.length >= 2) {
        const t0 = recent[0].ts.getTime();
        const xs = recent.map(r => (r.ts.getTime() - t0) / 3600000);
        const ys = recent.map(r => r.temp);
        const n = xs.length;
        const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
        const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sx2 = xs.reduce((a, x) => a + x * x, 0);
        const d = n * sx2 - sx * sx;
        if (Math.abs(d) > 1e-10) {
          const slope = (n * sxy - sx * sy) / d;
          rate = { perHour: Math.round(slope * 100) / 100, dir: Math.abs(slope) < 0.3 ? 'stable' : slope > 0 ? 'rising' : 'falling' };
        }
      }
    }

    // Time series (5-min buckets)
    const buckets = new Map();
    for (const r of allReadings) {
      const key = Math.floor(r.ts.getTime() / 300000) * 300000;
      if (!buckets.has(key)) buckets.set(key, { temps: [], hums: [], ts: new Date(key + 150000) });
      buckets.get(key).temps.push(r.temp);
      if (r.hum != null) buckets.get(key).hums.push(r.hum);
    }
    const timeSeries = Array.from(buckets.values())
      .map(b => ({
        ts: b.ts,
        temp: b.temps.reduce((a, t) => a + t, 0) / b.temps.length,
        hum: b.hums.length > 0 ? b.hums.reduce((a, h) => a + h, 0) / b.hums.length : null,
      }))
      .sort((a, b) => a.ts - b.ts);

    return {
      ...zCfg, sensorData, avgTemp, humidity, rate, timeSeries,
      online: withData.length > 0,
      coverage: sensorData.length === 0 ? 'uncovered' : withData.length === 0 ? 'offline' : withData.length < sensorData.length ? 'partial' : 'covered',
    };
  });

  // Weather
  let weather = null;
  if (rawWeather) {
    weather = {
      tempF: rawWeather.outdoor_temp_f,
      humidity: rawWeather.outdoor_humidity_pct,
      windMph: rawWeather.wind_speed_mph,
      windDir: rawWeather.wind_direction_deg,
      gustMph: rawWeather.wind_gust_mph,
      cloud: rawWeather.cloud_cover_pct,
      dewpoint: rawWeather.dewpoint_f,
    };
  }

  // Deltas
  const deltas = [];
  const seen = new Set();
  for (const z of zones) {
    for (const adjId of z.adjacent) {
      const pair = [z.id, adjId].sort().join('::');
      if (seen.has(pair)) continue;
      seen.add(pair);
      const adj = zones.find(zz => zz.id === adjId);
      if (!adj) continue;
      const d = z.avgTemp != null && adj.avgTemp != null ? Math.round((z.avgTemp - adj.avgTemp) * 10) / 10 : null;
      deltas.push({ a: z.name, b: adj.name, delta: d });
    }
  }

  const allTemps = zones.map(z => z.avgTemp).filter(t => t != null);
  const spread = allTemps.length >= 2 ? Math.round((Math.max(...allTemps) - Math.min(...allTemps)) * 10) / 10 : null;

  const anomalies = [];
  for (const z of zones) {
    if (z.avgTemp != null && z.avgTemp < 60)
      anomalies.push({ level: 'danger', msg: z.name + ' is ' + z.avgTemp.toFixed(1) + '°F — dangerously cold' });
    else if (z.avgTemp != null && z.avgTemp < 65)
      anomalies.push({ level: 'warning', msg: z.name + ' is ' + z.avgTemp.toFixed(1) + '°F — below comfort' });
    else if (z.avgTemp != null && z.avgTemp > 85)
      anomalies.push({ level: 'danger', msg: z.name + ' is ' + z.avgTemp.toFixed(1) + '°F — dangerously hot' });
    if (z.sensorData.length > 0 && !z.online)
      anomalies.push({ level: 'warning', msg: z.name + ' — all sensors offline' });
  }

  // Run diagnostics
  const diagnostics = runDiagnostics(zones, weather);

  return { zones, weather, deltas, spread, anomalies, readingCount: rawReadings.length, diagnostics };
}

// ── SVG HELPERS ──────────────────────────────────────────────
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// ── RENDERERS ────────────────────────────────────────────────

function renderAll(data, chartHours) {
  const { zones, weather, deltas, spread, anomalies, readingCount, diagnostics } = data;

  const ob = document.getElementById('outdoorBadge');
  if (ob && weather) ob.textContent = 'Outdoor: ' + weather.tempF.toFixed(1) + '°F';

  const ab = document.getElementById('anomalyBanner');
  if (ab) {
    const allAlerts = [...anomalies, ...diagnostics.faults.filter(f => f.level !== 'info')];
    if (allAlerts.length > 0) {
      ab.innerHTML = allAlerts.map(a =>
        '<div class="anomaly-item" data-level="' + (a.level || 'warning') + '">' + (a.msg) + '</div>'
      ).join('');
      ab.style.display = '';
    } else {
      ab.style.display = 'none';
    }
  }

  renderFloorPlan(zones);
  renderZoneCards(zones, weather, diagnostics);
  renderBulletCharts(zones);
  renderChart(zones, chartHours, diagnostics);
  renderCarpetPlot(zones);
  renderAnalysis(zones, weather, spread, anomalies, diagnostics);
  renderDeltas(deltas);
  renderDiagnosticSummary(diagnostics, zones);
  renderStatus(zones, readingCount, weather);
}

function renderFloorPlan(zones) {
  const fp = document.getElementById('floorPlan');
  if (!fp) return;

  const bg = cssVar('--bg'), sf = cssVar('--sd'), tx = cssVar('--tx');
  const ts = cssVar('--ts'), tm = cssVar('--tm');
  const bd = cssVar('--bd') || 'rgba(128,128,128,0.2)', ac = cssVar('--ac');

  const svg = svgEl('svg', { viewBox: '0 0 400 300' });
  svg.style.cssText = 'width:100%;display:block;';

  for (const z of zones) {
    const s = z.svg;
    const borderColor = z.online ? ac : bd;
    const fillColor = z.online ? sf : bg;
    const opacity = z.online ? 1 : 0.6;

    svg.appendChild(svgEl('rect', {
      x: s.x, y: s.y, width: s.w, height: s.h, rx: 6,
      fill: fillColor, stroke: borderColor, 'stroke-width': z.online ? 1.5 : 1, opacity,
    }));

    const label = svgEl('text', { x: s.cx, y: s.y + 50, 'text-anchor': 'middle', fill: ts, 'font-size': '11' });
    label.style.fontFamily = cssVar('--ff');
    label.textContent = z.name;
    svg.appendChild(label);

    const temp = svgEl('text', {
      x: s.cx, y: s.y + 82, 'text-anchor': 'middle',
      fill: z.online ? tx : tm, 'font-size': z.online ? '24' : '12', 'font-weight': z.online ? '700' : '400',
    });
    temp.style.fontFamily = cssVar('--ff');
    temp.textContent = z.avgTemp != null ? z.avgTemp.toFixed(1) + '°' : 'No data';
    svg.appendChild(temp);

    if (z.sensors.length > 1) {
      const badge = svgEl('text', { x: s.x + s.w - 10, y: s.y + 16, 'text-anchor': 'end', fill: tm, 'font-size': '9' });
      badge.textContent = '×' + z.sensors.length;
      svg.appendChild(badge);
    }
  }

  fp.innerHTML = '';
  fp.appendChild(svg);
}

function renderZoneCards(zones, weather, diagnostics) {
  const zc = document.getElementById('zonesContainer');
  if (!zc) return;

  zc.innerHTML = zones.map(z => {
    const diag = diagnostics.zoneResults.find(d => d.zoneId === z.id);
    const status = !z.online ? 'offline' : z.avgTemp && z.avgTemp < 65 ? 'warning' : 'ok';

    let rateBadge = '';
    if (z.rate) {
      const cls = z.rate.dir === 'rising' ? 'badge-rising' : z.rate.dir === 'falling' ? 'badge-falling' : 'badge-stable';
      const arrow = z.rate.dir === 'rising' ? '▲' : z.rate.dir === 'falling' ? '▼' : '—';
      rateBadge = '<span class="zone-badge ' + cls + '">' + arrow + ' ' + Math.abs(z.rate.perHour).toFixed(1) + '°/hr</span>';
    }

    const tempDisp = z.avgTemp != null
      ? '<span class="zone-temp">' + z.avgTemp.toFixed(1) + '°F</span>'
      : '<span class="zone-temp-na">No sensor</span>';

    const meta = [];
    if (z.humidity != null) meta.push(z.humidity.toFixed(0) + '% RH');
    if (diag && diag.dutyCycle != null) meta.push('Duty: ' + (diag.dutyCycle * 100).toFixed(0) + '%');
    if (diag && diag.tau != null) meta.push('τ: ' + diag.tau.toFixed(1) + 'h');
    const onlineCount = z.sensorData.filter(s => s.latest).length;
    meta.push(onlineCount + '/' + z.sensorData.length + ' sensors');

    return '<div class="zone-card" data-status="' + status + '">' +
      '<div class="zone-name">' + z.name + ' ' + rateBadge + '</div>' +
      tempDisp +
      (meta.length ? '<div class="zone-meta">' + meta.map(m => '<span>' + m + '</span>').join('') + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderBulletCharts(zones) {
  const el = document.getElementById('bulletCharts');
  if (!el) return;

  const W = 300, H = 28, PAD = 4;
  const lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];
  const tm = cssVar('--tm'), tx = cssVar('--tx'), ok = cssVar('--ok');
  const wn = cssVar('--wn'), dg = cssVar('--dg');

  const items = zones.filter(z => z.avgTemp != null).map((z, i) => {
    const dev = z.avgTemp - SETPOINT;
    return { name: z.name, dev, temp: z.avgTemp, color: lineColors[i % 4] };
  });

  if (items.length === 0) { el.innerHTML = '<div class="no-data">No data</div>'; return; }

  const maxDev = Math.max(6, ...items.map(i => Math.abs(i.dev) + 1));
  const svgH = items.length * (H + 6) + 10;

  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + svgH });
  svg.style.cssText = 'width:100%;display:block;';

  const cx = W * 0.55; // center (setpoint position)
  const bw = W * 0.35; // half-width of bar area

  items.forEach((item, idx) => {
    const y = idx * (H + 6) + 4;

    // Label
    const lbl = svgEl('text', { x: 4, y: y + H / 2 + 4, fill: tx, 'font-size': '10' });
    lbl.textContent = item.name;
    svg.appendChild(lbl);

    // Background bands: ±1 green, ±3 yellow, rest red-tinted
    const x1 = cx - bw, x2 = cx + bw;
    svg.appendChild(svgEl('rect', { x: x1, y: y, width: x2 - x1, height: H, rx: 3, fill: dg, opacity: 0.08 }));
    const y3 = cx - (3 / maxDev) * bw, y3w = (6 / maxDev) * bw;
    svg.appendChild(svgEl('rect', { x: y3, y: y, width: y3w, height: H, rx: 2, fill: wn, opacity: 0.1 }));
    const y1 = cx - (1 / maxDev) * bw, y1w = (2 / maxDev) * bw;
    svg.appendChild(svgEl('rect', { x: y1, y: y, width: y1w, height: H, rx: 2, fill: ok, opacity: 0.15 }));

    // Setpoint tick
    svg.appendChild(svgEl('line', { x1: cx, y1: y + 2, x2: cx, y2: y + H - 2, stroke: tm, 'stroke-width': 1.5 }));

    // Actual temp bar
    const barX = cx + (item.dev / maxDev) * bw;
    const barW = 3;
    svg.appendChild(svgEl('rect', {
      x: Math.min(cx, barX) - barW / 2, y: y + PAD,
      width: Math.abs(barX - cx) + barW, height: H - PAD * 2,
      rx: 2, fill: item.color, opacity: 0.7,
    }));

    // Temp value
    const vt = svgEl('text', {
      x: W - 4, y: y + H / 2 + 4, 'text-anchor': 'end', fill: tx, 'font-size': '10', 'font-weight': '600'
    });
    vt.textContent = item.temp.toFixed(1) + '°';
    svg.appendChild(vt);
  });

  el.innerHTML = '';
  el.appendChild(svg);
}

function renderChart(zones, hours, diagnostics) {
  const container = document.getElementById('tsChart');
  const legendEl = document.getElementById('tsLegend');
  const ganttEl = document.getElementById('dutyGantt');
  if (!container) return;

  const lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];
  const cutoff = new Date(Date.now() - hours * 3600000);

  const series = zones.map((z, i) => ({
    name: z.name, color: lineColors[i % 4],
    data: z.timeSeries.filter(p => p.ts >= cutoff),
  })).filter(s => s.data.length > 0);

  if (series.length === 0) {
    container.innerHTML = '<div class="no-data">No data for selected range</div>';
    if (legendEl) legendEl.innerHTML = '';
    if (ganttEl) ganttEl.innerHTML = '';
    return;
  }

  const allT = series.flatMap(s => s.data.map(d => d.temp));
  const allTs = series.flatMap(s => s.data.map(d => d.ts.getTime()));
  const tMin = Math.floor(Math.min(...allT) - 1), tMax = Math.ceil(Math.max(...allT) + 1);
  const tsMin = Math.min(...allTs), tsMax = Math.max(...allTs);

  const W = 1000, H = 200, P = { t: 20, r: 12, b: 30, l: 50 };
  const pW = W - P.l - P.r, pH = H - P.t - P.b;
  const sx = t => P.l + ((t - tsMin) / (tsMax - tsMin || 1)) * pW;
  const sy = t => P.t + pH - ((t - tMin) / (tMax - tMin || 1)) * pH;

  const bd = cssVar('--bd') || 'rgba(128,128,128,0.2)';
  const tm = cssVar('--tm');

  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });
  svg.style.cssText = 'width:100%;height:160px;display:block;';

  // Setpoint band
  if (SETPOINT >= tMin && SETPOINT <= tMax) {
    const ok = cssVar('--ok');
    svg.appendChild(svgEl('rect', {
      x: P.l, y: sy(SETPOINT + 1), width: pW, height: sy(SETPOINT - 1) - sy(SETPOINT + 1),
      fill: ok, opacity: 0.08,
    }));
    svg.appendChild(svgEl('line', {
      x1: P.l, y1: sy(SETPOINT), x2: W - P.r, y2: sy(SETPOINT),
      stroke: ok, 'stroke-width': 1, 'stroke-dasharray': '6,4', opacity: 0.4,
    }));
  }

  // Grid
  const step = Math.ceil((tMax - tMin) / 5) || 1;
  for (let v = Math.ceil(tMin / step) * step; v <= tMax; v += step) {
    svg.appendChild(svgEl('line', { x1: P.l, y1: sy(v), x2: W - P.r, y2: sy(v), stroke: bd, 'stroke-width': 1, 'stroke-dasharray': '4,4' }));
    const lbl = svgEl('text', { x: P.l - 8, y: sy(v) + 4, 'text-anchor': 'end', fill: tm, 'font-size': '11' });
    lbl.textContent = v + '°';
    svg.appendChild(lbl);
  }

  // Time labels
  const labelCount = Math.min(8, Math.max(4, Math.floor(pW / 100)));
  for (let i = 0; i <= labelCount; i++) {
    const t = tsMin + (tsMax - tsMin) * i / labelCount;
    const d = new Date(t);
    const lbl = svgEl('text', { x: sx(t), y: H - 6, 'text-anchor': 'middle', fill: tm, 'font-size': '10' });
    lbl.textContent = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    svg.appendChild(lbl);
  }

  // Data lines
  for (const s of series) {
    if (s.data.length < 2) continue;
    const pts = s.data.map(d => sx(d.ts.getTime()) + ',' + sy(d.temp)).join(' ');
    svg.appendChild(svgEl('polyline', {
      points: pts, fill: 'none', stroke: s.color,
      'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  container.innerHTML = '';
  container.appendChild(svg);

  // Legend
  if (legendEl) {
    legendEl.innerHTML = series.map(s =>
      '<div class="legend-item"><span class="legend-swatch" style="background:' + s.color + '"></span>' + s.name + '</div>'
    ).join('');
  }

  // Duty cycle Gantt
  if (ganttEl && diagnostics) {
    const gH = 12;
    const gSvg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + (zones.length * (gH + 4) + 4) });
    gSvg.style.cssText = 'width:100%;display:block;margin-top:4px;';

    zones.forEach((z, i) => {
      const diag = diagnostics.zoneResults.find(d => d.zoneId === z.id);
      if (!diag) return;
      const y = i * (gH + 4) + 2;
      const color = lineColors[i % 4];

      // Background
      gSvg.appendChild(svgEl('rect', { x: P.l, y, width: pW, height: gH, rx: 2, fill: bd, opacity: 0.3 }));

      // On segments
      for (const seg of diag.segments) {
        if (!seg.on) continue;
        const s = Math.max(seg.startTs.getTime(), tsMin);
        const e = Math.min(seg.endTs.getTime(), tsMax);
        if (e <= tsMin || s >= tsMax) continue;
        const x1 = sx(s), x2 = sx(e);
        gSvg.appendChild(svgEl('rect', { x: x1, y, width: Math.max(2, x2 - x1), height: gH, rx: 2, fill: color, opacity: 0.6 }));
      }
    });

    ganttEl.innerHTML = '';
    ganttEl.appendChild(gSvg);
  }
}

function renderCarpetPlot(zones) {
  const el = document.getElementById('carpetPlot');
  const tabsEl = document.getElementById('carpetTabs');
  if (!el) return;

  // Tab buttons
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
    if (ts.length < 12) { el.innerHTML = '<div class="no-data">Not enough data for carpet plot</div>'; return; }

    // Build hour×day grid
    const now = new Date();
    const days = 7;
    const grid = []; // grid[day][hour] = avg temp
    const dayLabels = [];
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      dayLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
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

    // Draw SVG
    const W = 480, cellW = 16, cellH = 22;
    const PL = 65, PT = 20;
    const svgH = PT + grid.length * cellH + 20;
    const svgW = PL + 24 * cellW + 10;

    const svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH });
    svg.style.cssText = 'width:100%;display:block;';

    const tm = cssVar('--tm');

    // Hour labels
    for (let h = 0; h < 24; h += 3) {
      const lbl = svgEl('text', { x: PL + h * cellW + cellW / 2, y: PT - 6, 'text-anchor': 'middle', fill: tm, 'font-size': '8' });
      lbl.textContent = h.toString().padStart(2, '0');
      svg.appendChild(lbl);
    }

    // Cells
    for (let d = 0; d < grid.length; d++) {
      // Day label
      const dl = svgEl('text', { x: PL - 6, y: PT + d * cellH + cellH / 2 + 3, 'text-anchor': 'end', fill: tm, 'font-size': '8' });
      dl.textContent = dayLabels[d];
      svg.appendChild(dl);

      for (let h = 0; h < 24; h++) {
        const v = grid[d][h];
        let fill = cssVar('--sd');
        if (v != null) {
          const dev = v - SETPOINT;
          if (dev < -3) fill = '#4575b4';
          else if (dev < -1) fill = '#91bfdb';
          else if (dev < 1) fill = cssVar('--ok');
          else if (dev < 3) fill = '#fee090';
          else fill = '#d73027';
        }
        svg.appendChild(svgEl('rect', {
          x: PL + h * cellW, y: PT + d * cellH, width: cellW - 1, height: cellH - 1,
          rx: 2, fill, opacity: v != null ? 0.8 : 0.2,
        }));
      }
    }

    el.innerHTML = '';
    el.appendChild(svg);
  }

  if (zones.length > 0) drawCarpet(zones[0]);
}

function renderAnalysis(zones, weather, spread, anomalies, diagnostics) {
  const ag = document.getElementById('analysisGrid');
  if (!ag) return;

  const items = [];

  if (spread != null)
    items.push({ l: 'House Spread', v: spread.toFixed(1) + '°F', cls: spread > 5 ? ' style="color:var(--wn)"' : '' });

  if (weather) {
    let detail = '';
    if (weather.humidity != null) detail += weather.humidity.toFixed(0) + '% RH';
    if (weather.windMph != null) detail += ' · ' + weather.windMph.toFixed(0) + ' mph';
    if (weather.windDir != null) detail += ' ' + weather.windDir.toFixed(0) + '°';
    items.push({ l: 'Outdoor', v: weather.tempF.toFixed(1) + '°F', d: detail });
  }

  // Indoor-outdoor ΔT (average)
  if (weather) {
    const onlineZ = zones.filter(z => z.avgTemp != null);
    if (onlineZ.length > 0) {
      const avgIndoor = onlineZ.reduce((s, z) => s + z.avgTemp, 0) / onlineZ.length;
      const dt = avgIndoor - weather.tempF;
      items.push({ l: 'Indoor-Outdoor ΔT', v: (dt > 0 ? '+' : '') + dt.toFixed(1) + '°F' });
    }
  }

  // Fastest changing zone
  const ratedZones = zones.filter(z => z.rate && z.rate.dir !== 'stable').sort((a, b) => Math.abs(b.rate.perHour) - Math.abs(a.rate.perHour));
  if (ratedZones.length > 0) {
    const fz = ratedZones[0];
    const arrow = fz.rate.dir === 'rising' ? '▲' : '▼';
    items.push({ l: 'Fastest Change', v: arrow + ' ' + Math.abs(fz.rate.perHour).toFixed(1) + '°/hr', d: fz.name });
  }

  // Dewpoint margin (if weather has dewpoint and we have indoor temp)
  if (weather && weather.dewpoint != null) {
    const coldestZone = zones.filter(z => z.avgTemp != null).sort((a, b) => a.avgTemp - b.avgTemp)[0];
    if (coldestZone) {
      // Rough estimate: wall surface ~2-5°F cooler than air
      const estWall = coldestZone.avgTemp - 4;
      const margin = estWall - weather.dewpoint;
      const cls = margin < 5 ? ' style="color:var(--wn)"' : '';
      items.push({ l: 'Dew Pt Margin (est)', v: margin.toFixed(1) + '°F', d: coldestZone.name + ' wall est.', cls });
    }
  }

  ag.innerHTML = items.map(i =>
    '<div class="analysis-item"><div class="analysis-label">' + i.l + '</div>' +
    '<div class="analysis-value"' + (i.cls || '') + '>' + i.v + '</div>' +
    (i.d ? '<div class="analysis-detail">' + i.d + '</div>' : '') +
    '</div>'
  ).join('');
}

function renderDeltas(deltas) {
  const dg = document.getElementById('deltaGrid');
  if (!dg) return;

  dg.innerHTML = deltas.map(d => {
    const cls = d.delta != null && Math.abs(d.delta) > 3 ? ' high' : '';
    const val = d.delta != null ? (d.delta > 0 ? '+' : '') + d.delta + '°F' : 'n/a';
    return '<div class="delta-item"><span class="delta-pair">' + d.a + ' ↔ ' + d.b + '</span><span class="delta-value' + cls + '">' + val + '</span></div>';
  }).join('');
}

function renderDiagnosticSummary(diagnostics, zones) {
  const el = document.getElementById('diagnosticSummary');
  if (!el) return;

  const lineColors = [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4')];

  // Per-zone metrics table
  let html = '<div class="diag-table">';
  html += '<div class="diag-header"><span>Zone</span><span>Duty</span><span>Recovery</span><span>Drift</span><span>τ</span></div>';

  diagnostics.zoneResults.forEach((r, i) => {
    const color = lineColors[i % 4];
    const dutyCls = r.dutyCycle > 0.85 ? 'diag-danger' : r.dutyCycle > 0.65 ? 'diag-warn' : 'diag-ok';
    html += '<div class="diag-row">' +
      '<span><span class="legend-swatch" style="background:' + color + ';display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:middle;"></span>' + r.zoneName + '</span>' +
      '<span class="' + dutyCls + '">' + (r.dutyCycle != null ? (r.dutyCycle * 100).toFixed(0) + '%' : '—') + '</span>' +
      '<span>' + (r.avgRecoveryRate != null ? r.avgRecoveryRate.toFixed(1) + '°/hr' : '—') + '</span>' +
      '<span>' + (r.driftRate != null ? (r.driftRate * 100).toFixed(1) + '%/hr' : '—') + '</span>' +
      '<span>' + (r.tau != null ? r.tau.toFixed(1) + 'h' : '—') + '</span>' +
      '</div>';
  });
  html += '</div>';

  // Fault list
  if (diagnostics.faults.length > 0) {
    html += '<div class="diag-faults">';
    for (const f of diagnostics.faults) {
      const icon = f.level === 'danger' ? '⚠' : f.level === 'warning' ? '⚡' : 'ℹ';
      html += '<div class="diag-fault" data-level="' + f.level + '">' +
        '<span class="diag-fault-icon">' + icon + '</span>' +
        '<span class="diag-fault-type">' + f.type + '</span> ' +
        '<span class="diag-fault-msg">' + f.msg + '</span></div>';
    }
    html += '</div>';
  } else {
    html += '<div class="diag-ok-msg">No anomalies detected in current data window</div>';
  }

  // Coupling coefficients
  if (diagnostics.couplings.length > 0) {
    html += '<div class="diag-couplings"><div class="analysis-label" style="margin-top:12px;">Zone Coupling (Pearson r)</div>';
    for (const c of diagnostics.couplings) {
      const rVal = c.r != null ? c.r.toFixed(2) : '—';
      const cls = c.r != null && c.r > 0.9 ? 'diag-ok' : c.r != null && c.r < 0.5 ? 'diag-warn' : '';
      html += '<div class="delta-item"><span class="delta-pair">' + c.a + ' ↔ ' + c.b + '</span><span class="delta-value ' + cls + '">' + rVal + '</span></div>';
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

function renderStatus(zones, readingCount, weather) {
  const sb = document.getElementById('statusBar');
  if (!sb) return;

  const online = zones.filter(z => z.online).length;
  const dot = online === zones.length ? 'ok' : online > 0 ? 'warning' : 'danger';
  const weatherStatus = weather ? '' : ' · weather unavailable';

  sb.innerHTML =
    '<span><span class="status-dot ' + dot + '"></span>' + online + '/' + zones.length + ' zones reporting</span>' +
    '<span>Updated ' + new Date().toLocaleTimeString() + ' · ' + readingCount + ' readings' + weatherStatus + '</span>';
}

// ── MAIN LOOP ────────────────────────────────────────────────
let chartHours = 24;
let lastData = null;

async function refresh() {
  try {
    const [readings, weather] = await Promise.all([fetchReadings(), fetchWeather()]);
    lastData = processData(readings, weather);
    renderAll(lastData, chartHours);
  } catch (e) {
    console.error('Refresh error:', e);
    const sb = document.getElementById('statusBar');
    if (sb) sb.innerHTML = '<span style="color:var(--dg)">Error: ' + e.message + '</span>';
  }
}

// ── INIT ─────────────────────────────────────────────────────
(function () {
  const saved = localStorage.getItem('hvac-theme') || 'tenebrae';
  applyTheme(saved);

  const ts = document.getElementById('themeSwitcher');
  if (ts) {
    ts.innerHTML = THEMES.map(t =>
      '<button class="theme-btn' + (t === saved ? ' active' : '') + '" data-theme="' + t + '">' +
      THEME_LABELS[t] + '</button>'
    ).join('');
    ts.addEventListener('click', e => {
      const b = e.target.closest('.theme-btn');
      if (b) {
        applyTheme(b.dataset.theme);
        if (lastData) setTimeout(() => renderAll(lastData, chartHours), 50);
      }
    });
  }

  const ct = document.getElementById('chartTabs');
  if (ct) ct.addEventListener('click', e => {
    const tab = e.target.closest('.chart-tab');
    if (!tab) return;
    chartHours = parseInt(tab.dataset.range, 10);
    ct.querySelectorAll('.chart-tab').forEach(t => t.classList.toggle('active', t === tab));
    if (lastData) renderChart(lastData.zones, chartHours, lastData.diagnostics);
  });

  refresh();
  setInterval(refresh, POLL_MS);
})();

// DEBUG — remove after testing
