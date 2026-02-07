const D = document.getElementById('statusBar');
const log = msg => { D.innerHTML += msg + '<br>'; };

(async () => {
  const { SUPABASE_CONFIG } = await import('./infrastructure/config/SensorRegistry.js');
  const h = { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey };

  const resp = await fetch(SUPABASE_CONFIG.url + '/rest/v1/readings?temp_f=not.is.null&select=sensor_id,temp_f,timestamp&order=timestamp.desc&limit=50', { headers: h });
  const rows = await resp.json();

  const ids = [...new Set(rows.map(r => r.sensor_id))];
  log('Distinct sensor_ids with data: ' + JSON.stringify(ids));
  for(const id of ids) {
    const samples = rows.filter(r => r.sensor_id === id);
    log(id + ': ' + samples.length + ' rows, latest=' + samples[0].temp_f + '°F at ' + samples[0].timestamp);
  }
})();
