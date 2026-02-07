// ══════════════════════════════════════════════════
// HVAC MONITOR — SINGLE FILE BUNDLE (no imports to cache)
// ══════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────
const SUPABASE_URL = 'https://pbidxylxpolvddukhxlr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWR4eWx4cG9sdmRkdWtoeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTM2NTcsImV4cCI6MjA4NTk2OTY1N30.zgCiG43jKnD3v1aKXfWh929I47GnvdkRYs0pOSc6EFo';
const TABLE = 'readings';
const POLL_MS = 300000;
const HISTORY_HOURS = 24;
const STALE_MINUTES = 120;

const ZONES = [
  {
    id:'teddys_room', name:"Teddy's Room", hvac:'boys_rooms',
    adjacent:['eliots_room','master'],
    sensors:[{id:"teddy's_room___sensor___temperature_and_relative_humidity", label:"Teddy's Sensor"}],
    svg:{x:10,y:10,w:180,h:130,cx:100}
  },
  {
    id:'eliots_room', name:"Eliot's Room", hvac:'boys_rooms',
    adjacent:['teddys_room','master'],
    sensors:[{id:"eliot's_room___sensor___temperature_and_relative_humidity", label:"Eliot's Sensor"}],
    svg:{x:200,y:10,w:180,h:130,cx:290}
  },
  {
    id:'master', name:'Master Bedroom', hvac:'master',
    adjacent:['teddys_room','eliots_room'],
    sensors:[{id:'master_bedroom___sensor___temperature_and_relative_humidity', label:'Master Sensor'}],
    svg:{x:10,y:150,w:180,h:130,cx:100}
  },
  {
    id:'play_room', name:'Play Room', hvac:'downstairs',
    adjacent:[],
    sensors:[
      {id:'play_room___sensor___temperature_and_relative_humidity', label:'Play Room Sensor'},
      {id:'multipurpose_sensor', label:'Multipurpose Sensor'}
    ],
    svg:{x:200,y:150,w:180,h:130,cx:290}
  }
];

// ── SUPABASE FETCH ───────────────────────────────
const headers = {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY};

async function fetchReadings() {
  const since = new Date(Date.now()-HISTORY_HOURS*3600000).toISOString();
  const url = SUPABASE_URL+'/rest/v1/'+TABLE+'?timestamp=gte.'+since+'&temp_f=not.is.null&sensor_id=neq.outdoor_weather&select=sensor_id,timestamp,temp_f,humidity_pct,battery_pct&order=timestamp.asc&limit=10000';
  const r = await fetch(url,{headers});
  return r.ok ? r.json() : [];
}

async function fetchWeather() {
  const url = SUPABASE_URL+'/rest/v1/'+TABLE+'?sensor_id=eq.outdoor_weather&outdoor_temp_f=not.is.null&select=timestamp,outdoor_temp_f,outdoor_humidity_pct,wind_speed_mph,wind_gust_mph,wind_direction_deg,cloud_cover_pct,dewpoint_f,pressure_inhg,precip_last_hour_in&order=timestamp.desc&limit=1';
  const r = await fetch(url,{headers});
  if(!r.ok) return null;
  const rows = await r.json();
  return rows[0]||null;
}

// ── THEME ENGINE ─────────────────────────────────
const THEMES = ['vellum','obsidian','vesper','scriptorium'];
function applyTheme(id) {
  document.documentElement.setAttribute('data-theme',id);
  try{localStorage.setItem('hvac-theme',id)}catch{}
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b.dataset.theme===id));
}

// ── DATA PROCESSING ──────────────────────────────
function processData(rawReadings, rawWeather) {
  const zones = ZONES.map(zCfg => {
    const sensorData = zCfg.sensors.map(sCfg => {
      const readings = rawReadings
        .filter(r=>r.sensor_id===sCfg.id)
        .map(r=>({ts:new Date(r.timestamp),temp:r.temp_f,hum:r.humidity_pct,batt:r.battery_pct}))
        .sort((a,b)=>a.ts-b.ts);
      const latest = readings[readings.length-1]||null;
      const stale = latest ? (Date.now()-latest.ts)/60000 > STALE_MINUTES : true;
      return {id:sCfg.id, label:sCfg.label, readings, latest, stale, online:!!latest&&!stale};
    });

    const onlineSensors = sensorData.filter(s=>s.latest);
    const temps = onlineSensors.map(s=>s.latest.temp);
    const avgTemp = temps.length>0 ? temps.reduce((a,b)=>a+b,0)/temps.length : null;
    const humidity = onlineSensors.length>0&&onlineSensors[0].latest.hum!=null ? onlineSensors[0].latest.hum : null;

    // Rate of change (last 30 min)
    let rate = null;
    const allReadings = sensorData.flatMap(s=>s.readings);
    if(allReadings.length>=2){
      const cutoff = new Date(Date.now()-30*60000);
      const recent = allReadings.filter(r=>r.ts>=cutoff);
      if(recent.length>=2){
        const t0=recent[0].ts.getTime();
        const xs=recent.map(r=>(r.ts.getTime()-t0)/3600000);
        const ys=recent.map(r=>r.temp);
        const n=xs.length;
        const sx=xs.reduce((a,b)=>a+b,0), sy=ys.reduce((a,b)=>a+b,0);
        const sxy=xs.reduce((a,x,i)=>a+x*ys[i],0), sx2=xs.reduce((a,x)=>a+x*x,0);
        const d=n*sx2-sx*sx;
        if(Math.abs(d)>1e-10){
          const slope=(n*sxy-sx*sy)/d;
          rate={perHour:Math.round(slope*100)/100, dir:Math.abs(slope)<0.3?'stable':slope>0?'rising':'falling'};
        }
      }
    }

    // Time series for chart (5-min buckets)
    const buckets = new Map();
    for(const r of allReadings){
      const key = Math.floor(r.ts.getTime()/300000)*300000;
      if(!buckets.has(key)) buckets.set(key,{temps:[],ts:new Date(key+150000)});
      buckets.get(key).temps.push(r.temp);
    }
    const timeSeries = Array.from(buckets.values())
      .map(b=>({ts:b.ts,temp:b.temps.reduce((a,t)=>a+t,0)/b.temps.length}))
      .sort((a,b)=>a.ts-b.ts);

    return {
      ...zCfg, sensorData, avgTemp, humidity, rate, timeSeries,
      online: onlineSensors.length>0,
      coverage: sensorData.length===0?'uncovered':onlineSensors.length===0?'offline':onlineSensors.length<sensorData.length?'partial':'covered'
    };
  });

  // Weather
  let weather = null;
  if(rawWeather){
    weather = {
      tempF:rawWeather.outdoor_temp_f, humidity:rawWeather.outdoor_humidity_pct,
      windMph:rawWeather.wind_speed_mph, windDir:rawWeather.wind_direction_deg,
      gustMph:rawWeather.wind_gust_mph, cloud:rawWeather.cloud_cover_pct,
      dewpoint:rawWeather.dewpoint_f
    };
  }

  // Deltas (adjacent only)
  const deltas = [];
  const seen = new Set();
  for(const z of zones){
    for(const adjId of z.adjacent){
      const pair = [z.id,adjId].sort().join('::');
      if(seen.has(pair)) continue;
      seen.add(pair);
      const adj = zones.find(zz=>zz.id===adjId);
      if(!adj) continue;
      const d = z.avgTemp!=null&&adj.avgTemp!=null ? Math.round((z.avgTemp-adj.avgTemp)*10)/10 : null;
      deltas.push({a:z.name,b:adj.name,delta:d});
    }
  }

  // House spread
  const allTemps = zones.map(z=>z.avgTemp).filter(t=>t!=null);
  const spread = allTemps.length>=2 ? Math.round((Math.max(...allTemps)-Math.min(...allTemps))*10)/10 : null;

  // Anomalies
  const anomalies = [];
  for(const z of zones){
    if(z.avgTemp!=null&&z.avgTemp<60) anomalies.push({level:'danger',msg:z.name+' is '+z.avgTemp.toFixed(1)+'°F — dangerously cold'});
    else if(z.avgTemp!=null&&z.avgTemp<65) anomalies.push({level:'warning',msg:z.name+' is '+z.avgTemp.toFixed(1)+'°F — below comfort'});
    else if(z.avgTemp!=null&&z.avgTemp>85) anomalies.push({level:'danger',msg:z.name+' is '+z.avgTemp.toFixed(1)+'°F — dangerously hot'});
    if(z.sensorData.length>0&&!z.online) anomalies.push({level:'warning',msg:z.name+' — all sensors offline'});
  }

  return {zones,weather,deltas,spread,anomalies,readingCount:rawReadings.length};
}

// ── RENDERERS ────────────────────────────────────
function renderAll(data, chartHours) {
  const {zones,weather,deltas,spread,anomalies,readingCount} = data;

  // Outdoor badge
  const ob = document.getElementById('outdoorBadge');
  if(ob&&weather) ob.textContent = 'Outdoor: '+weather.tempF.toFixed(1)+'°F';

  // Anomaly banner
  const ab = document.getElementById('anomalyBanner');
  if(ab){
    const serious = anomalies.filter(a=>a.level!=='info');
    if(serious.length>0){
      ab.innerHTML = serious.map(a=>'<div class="anomaly-item" data-level="'+a.level+'">'+a.msg+'</div>').join('');
      ab.style.display='';
    } else ab.style.display='none';
  }

  // Floor plan SVG
  const fp = document.getElementById('floorPlan');
  if(fp){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 400 300');
    svg.style.width='100%';
    for(const z of zones){
      const s=z.svg;
      const rect=svgEl('rect',{x:s.x,y:s.y,width:s.w,height:s.h,rx:6,fill:z.online?'var(--surface-dim)':'var(--bg)',stroke:z.online?'var(--success)':'var(--text-muted)','stroke-width':z.online?2:1,opacity:z.online?1:0.5});
      svg.appendChild(rect);
      const label=svgEl('text',{x:s.cx,y:s.y+50,'text-anchor':'middle',fill:'var(--text-secondary)','font-size':'11','font-family':'var(--font)'});
      label.textContent=z.name;
      svg.appendChild(label);
      const temp=svgEl('text',{x:s.cx,y:s.y+80,'text-anchor':'middle',fill:z.online?'var(--text)':'var(--text-muted)','font-size':z.online?'22':'12','font-weight':z.online?'700':'400','font-family':'var(--font)'});
      temp.textContent=z.avgTemp!=null?z.avgTemp.toFixed(1)+'°':'No sensor';
      svg.appendChild(temp);
      if(z.sensors.length>1){
        const badge=svgEl('text',{x:s.x+s.w-10,y:s.y+16,'text-anchor':'end',fill:'var(--text-muted)','font-size':'9'});
        badge.textContent='×'+z.sensors.length;
        svg.appendChild(badge);
      }
    }
    fp.innerHTML='';
    fp.appendChild(svg);
  }

  // Zone cards
  const zc = document.getElementById('zonesContainer');
  if(zc){
    zc.innerHTML = zones.map(z=>{
      const status = !z.online?'offline':z.avgTemp&&z.avgTemp<65?'warning':'ok';
      let rateBadge='';
      if(z.rate){
        const cls=z.rate.dir==='rising'?'badge-rising':z.rate.dir==='falling'?'badge-falling':'badge-stable';
        const arrow=z.rate.dir==='rising'?'↑':z.rate.dir==='falling'?'↓':'→';
        rateBadge='<span class="zone-badge '+cls+'">'+arrow+' '+Math.abs(z.rate.perHour).toFixed(1)+'°/hr</span>';
      }
      const tempDisp=z.avgTemp!=null?'<span class="zone-temp">'+z.avgTemp.toFixed(1)+'°F</span>':'<span class="zone-temp-na">No sensor</span>';
      const meta=[];
      if(z.humidity!=null) meta.push(z.humidity.toFixed(0)+'% RH');
      if(z.avgTemp!=null&&weather) meta.push('ΔT: '+(z.avgTemp-weather.tempF>0?'+':'')+(z.avgTemp-weather.tempF).toFixed(1)+'°');
      const onlineCount=z.sensorData.filter(s=>s.latest).length;
      meta.push(onlineCount+'/'+z.sensorData.length+' sensors');
      return '<div class="zone-card" data-status="'+status+'"><div class="zone-name">'+z.name+' '+rateBadge+'</div>'+tempDisp+(meta.length?'<div class="zone-meta">'+meta.map(m=>'<span>'+m+'</span>').join('')+'</div>':'')+'</div>';
    }).join('');
  }

  // Timeseries chart
  renderChart(zones, chartHours);

  // Analysis
  const ag = document.getElementById('analysisGrid');
  if(ag){
    const items=[];
    if(spread!=null) items.push({l:'House Spread',v:spread.toFixed(1)+'°F'});
    if(weather){
      items.push({l:'Outdoor',v:weather.tempF.toFixed(1)+'°F',d:(weather.humidity||'')+'% RH · '+(weather.windMph||0).toFixed(0)+' mph'});
    }
    ag.innerHTML=items.map(i=>'<div class="analysis-item"><div class="analysis-label">'+i.l+'</div><div class="analysis-value">'+i.v+'</div>'+(i.d?'<div class="analysis-detail">'+i.d+'</div>':'')+'</div>').join('');
  }

  // Deltas
  const dg = document.getElementById('deltaGrid');
  if(dg){
    dg.innerHTML=deltas.map(d=>'<div class="delta-item"><span class="delta-pair">'+d.a+' ↔ '+d.b+'</span><span class="delta-value'+(d.delta!=null&&Math.abs(d.delta)>3?' high':'')+'">'+(d.delta!=null?(d.delta>0?'+':'')+d.delta+'°F':'n/a')+'</span></div>').join('');
  }

  // Status bar
  const sb = document.getElementById('statusBar');
  if(sb){
    const online=zones.filter(z=>z.online).length;
    const dot=online===zones.length?'ok':online>0?'warning':'danger';
    sb.innerHTML='<span><span class="status-dot '+dot+'"></span>'+online+'/'+zones.length+' zones reporting</span><span>Updated '+new Date().toLocaleTimeString()+' · '+readingCount+' readings</span>';
  }
}

function renderChart(zones, hours) {
  const container = document.getElementById('tsChart');
  const legend = document.getElementById('tsLegend');
  if(!container) return;

  const lineColors = ['var(--line-1)','var(--line-2)','var(--line-3)','var(--line-4)'];
  const cutoff = new Date(Date.now()-hours*3600000);
  const series = zones.map((z,i)=>({name:z.name,color:lineColors[i%4],data:z.timeSeries.filter(p=>p.ts>=cutoff)})).filter(s=>s.data.length>0);

  if(series.length===0){
    container.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:40px">No data for selected range</div>';
    if(legend) legend.innerHTML='';
    return;
  }

  const allT=series.flatMap(s=>s.data.map(d=>d.temp));
  const allTs=series.flatMap(s=>s.data.map(d=>d.ts.getTime()));
  const tMin=Math.floor(Math.min(...allT)-1),tMax=Math.ceil(Math.max(...allT)+1);
  const tsMin=Math.min(...allTs),tsMax=Math.max(...allTs);
  const W=800,H=240,P={t:20,r:12,b:30,l:45};
  const pW=W-P.l-P.r,pH=H-P.t-P.b;
  const sx=t=>P.l+((t-tsMin)/(tsMax-tsMin||1))*pW;
  const sy=t=>P.t+pH-((t-tMin)/(tMax-tMin||1))*pH;

  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.style.width='100%';svg.style.height='100%';

  // Grid
  const step=Math.ceil((tMax-tMin)/5)||1;
  for(let v=Math.ceil(tMin/step)*step;v<=tMax;v+=step){
    svg.appendChild(svgEl('line',{x1:P.l,y1:sy(v),x2:W-P.r,y2:sy(v),stroke:'var(--chart-grid)','stroke-width':1}));
    const lbl=svgEl('text',{x:P.l-6,y:sy(v)+4,'text-anchor':'end',fill:'var(--chart-text)','font-size':'10'});
    lbl.textContent=v+'°';svg.appendChild(lbl);
  }

  // Time labels
  for(let i=0;i<=6;i++){
    const t=tsMin+(tsMax-tsMin)*i/6;
    const d=new Date(t);
    const lbl=svgEl('text',{x:sx(t),y:H-6,'text-anchor':'middle',fill:'var(--chart-text)','font-size':'10'});
    lbl.textContent=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    svg.appendChild(lbl);
  }

  // Lines
  for(const s of series){
    if(s.data.length<2) continue;
    const pts=s.data.map(d=>sx(d.ts.getTime())+','+sy(d.temp)).join(' ');
    svg.appendChild(svgEl('polyline',{points:pts,fill:'none',stroke:s.color,'stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}));
  }

  container.innerHTML='';
  container.appendChild(svg);

  if(legend){
    legend.innerHTML=series.map(s=>'<div class="legend-item"><span class="legend-swatch" style="background:'+s.color+'"></span>'+s.name+'</div>').join('');
  }
}

function svgEl(tag,attrs={}){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));
  return el;
}

// ── MAIN LOOP ────────────────────────────────────
let chartHours = 6;
let lastData = null;

async function refresh() {
  try {
    const [readings, weather] = await Promise.all([fetchReadings(), fetchWeather()]);
    lastData = processData(readings, weather);
    renderAll(lastData, chartHours);
  } catch(e) {
    const sb = document.getElementById('statusBar');
    if(sb) sb.innerHTML='<span style="color:var(--danger)">Error: '+e.message+'</span>';
  }
}

// Init
(function(){
  // Theme
  const saved = localStorage.getItem('hvac-theme')||'obsidian';
  applyTheme(saved);
  const ts = document.getElementById('themeSwitcher');
  if(ts){
    ts.innerHTML=THEMES.map(t=>'<button class="theme-btn'+(t===saved?' active':'')+'" data-theme="'+t+'" title="'+t+'"></button>').join('');
    ts.addEventListener('click',e=>{const b=e.target.closest('.theme-btn');if(b){applyTheme(b.dataset.theme);if(lastData)renderAll(lastData,chartHours);}});
  }

  // Chart tabs
  const ct = document.getElementById('chartTabs');
  if(ct) ct.addEventListener('click',e=>{
    const tab=e.target.closest('.chart-tab');
    if(!tab) return;
    chartHours=parseInt(tab.dataset.range,10);
    ct.querySelectorAll('.chart-tab').forEach(t=>t.classList.toggle('active',t===tab));
    if(lastData) renderChart(lastData.zones, chartHours);
  });

  // Go
  refresh();
  setInterval(refresh, POLL_MS);
})();
