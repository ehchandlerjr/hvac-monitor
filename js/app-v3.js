const D = document.getElementById('statusBar');
const errors = [];
const log = msg => { errors.push(msg); if(D) D.innerHTML = '<span style="color:#0f0;font-size:10px;white-space:pre-wrap">' + errors.slice(-15).join('\n') + '</span>'; };
window.onerror = (m,s,l) => log('ERR: '+m);
window.addEventListener('unhandledrejection', e => log('PROMISE: '+e.reason));

(async () => {
  try {
    const { SUPABASE_CONFIG, POLL_INTERVAL_MS, DEFAULT_HISTORY_HOURS, THERMAL_RESISTANCES, buildZoneGraph } = await import('./infrastructure/config/SensorRegistry.js');
    const { SupabaseAdapter } = await import('./infrastructure/adapters/SupabaseAdapter.js');
    const { BrowserClockAdapter } = await import('./infrastructure/adapters/BrowserClockAdapter.js');
    const { Reading } = await import('./domain/entities/Reading.js');
    const { ThemeEngine } = await import('./presentation/engine/ThemeEngine.js');

    const zones = buildZoneGraph();
    const supabase = new SupabaseAdapter(SUPABASE_CONFIG);
    const clock = new BrowserClockAdapter();
    const theme = new ThemeEngine('obsidian');
    theme.initialize();

    // Discover actual columns
    log('Checking table columns...');
    const colResp = await fetch(SUPABASE_CONFIG.url + '/rest/v1/readings?limit=1', {
      headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey }
    });
    const colRows = await colResp.json();
    if(colRows.length > 0) log('Columns: ' + Object.keys(colRows[0]).join(', '));

    // Fetch readings
    log('Fetching readings...');
    const raw = await supabase.fetchReadings(DEFAULT_HISTORY_HOURS);
    const good = raw.filter(r => r.temp_f != null);
    log('Readings: ' + good.length + ' good / ' + raw.length + ' total');

    // Get one row with outdoor data to see column names
    const weatherResp = await fetch(SUPABASE_CONFIG.url + '/rest/v1/readings?sensor_id=eq.outdoor_weather&limit=1&order=timestamp.desc', {
      headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey }
    });
    const weatherRows = await weatherResp.json();
    if(weatherRows.length > 0) {
      log('Weather row keys: ' + Object.keys(weatherRows[0]).join(', '));
      log('Weather sample: ' + JSON.stringify(weatherRows[0]).substring(0,300));
    } else {
      log('No outdoor_weather rows found');
    }

    // Create readings & hydrate zones
    const readings = good.map(r => new Reading({
      sensorId: r.sensor_id, timestamp: new Date(r.timestamp),
      tempF: r.temp_f, humidityPct: r.humidity_pct, batteryPct: r.battery_pct,
    }));

    for (const zone of zones) {
      for (const sensor of zone.sensors) {
        sensor.clearReadings();
        sensor.ingestReadings(readings);
      }
      const t = zone.currentTempF;
      log(zone.name + ': ' + (t ? t.toFixed(1) + '°F' : 'no data') + ' (' + zone.sensors[0]?.readingCount + ' readings)');
    }

    log('All diagnostics complete.');
  } catch(e) {
    log('FATAL: ' + e.message);
    log(e.stack);
  }
})();
