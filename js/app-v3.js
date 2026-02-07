const D = document.getElementById('statusBar');
const errors = [];
const log = msg => { errors.push(msg); if(D) D.innerHTML = '<span style="color:red;font-size:11px;white-space:pre-wrap">' + errors.join('\n') + '</span>'; console.log(msg); };
window.onerror = (m,s,l) => log('ERR: '+m+' '+s+':'+l);
window.addEventListener('unhandledrejection', e => log('PROMISE: '+e.reason));

(async () => {
  try {
    log('1. Loading config...');
    const { SUPABASE_CONFIG, POLL_INTERVAL_MS, DEFAULT_HISTORY_HOURS, THERMAL_RESISTANCES, buildZoneGraph } = await import('./infrastructure/config/SensorRegistry.js');

    log('2. Building zones...');
    const zones = buildZoneGraph();
    log('   Zones: ' + zones.map(z => z.name).join(', '));

    log('3. Loading adapters...');
    const { SupabaseAdapter } = await import('./infrastructure/adapters/SupabaseAdapter.js');
    const { MockAdapter } = await import('./infrastructure/adapters/MockAdapter.js');
    const { BrowserClockAdapter } = await import('./infrastructure/adapters/BrowserClockAdapter.js');

    const isConfigured = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey;
    const dataPort = isConfigured ? new SupabaseAdapter(SUPABASE_CONFIG) : new MockAdapter();
    log('4. DataPort: ' + (isConfigured ? 'Supabase' : 'Mock'));

    log('5. Fetching readings...');
    const raw = await dataPort.fetchReadings(DEFAULT_HISTORY_HOURS);
    log('   Raw rows: ' + raw.length);
    const nullTemps = raw.filter(r => r.temp_f == null).length;
    const goodTemps = raw.filter(r => r.temp_f != null).length;
    log('   Good: ' + goodTemps + ', Null temp_f: ' + nullTemps);
    if(raw.length > 0) log('   Sample: ' + JSON.stringify(raw[0]).substring(0,200));

    log('6. Fetching weather...');
    const weather = await dataPort.fetchLatestWeather();
    log('   Weather: ' + (weather ? weather.outdoor_temp_f + '°F' : 'null'));

    log('7. Loading domain...');
    const { Reading } = await import('./domain/entities/Reading.js');
    const filtered = raw.filter(r => r.temp_f != null);
    log('   Creating ' + filtered.length + ' readings...');
    const readings = filtered.map(r => new Reading({
      sensorId: r.sensor_id,
      timestamp: new Date(r.timestamp),
      tempF: r.temp_f,
      humidityPct: r.humidity_pct,
      batteryPct: r.battery_pct,
    }));
    log('   Readings created: ' + readings.length);

    log('8. Distributing to zones...');
    for (const zone of zones) {
      for (const sensor of zone.sensors) {
        sensor.clearReadings();
        sensor.ingestReadings(readings);
      }
      log('   ' + zone.name + ': ' + zone.currentTempF?.toFixed(1) + '°F (' + zone.sensors[0]?.readingCount + ' readings)');
    }

    log('9. Loading App...');
    const { ThemeEngine } = await import('./presentation/engine/ThemeEngine.js');
    const { App } = await import('./presentation/App.js');

    log('10. Starting app...');
    const app = new App({
      dataPort,
      clockPort: new BrowserClockAdapter(),
      themeEngine: new ThemeEngine('vellum'),
      zones: buildZoneGraph(),
      thermalResistances: THERMAL_RESISTANCES,
      pollIntervalMs: isConfigured ? POLL_INTERVAL_MS : 30000,
      historyHours: DEFAULT_HISTORY_HOURS,
      isDemo: !isConfigured,
    });
    await app.start();
    log('DONE - app running');
  } catch(e) {
    log('FATAL: ' + e.message);
    log(e.stack);
  }
})();
