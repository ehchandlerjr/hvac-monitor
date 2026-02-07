import { SupabaseAdapter } from './infrastructure/adapters/SupabaseAdapter.js';
import { MockAdapter } from './infrastructure/adapters/MockAdapter.js';
import { BrowserClockAdapter } from './infrastructure/adapters/BrowserClockAdapter.js';
import { SUPABASE_CONFIG, POLL_INTERVAL_MS, DEFAULT_HISTORY_HOURS, THERMAL_RESISTANCES, buildZoneGraph } from './infrastructure/config/SensorRegistry.js';
import { ThemeEngine } from './presentation/engine/ThemeEngine.js';
import { App } from './presentation/App.js';

const isConfigured = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey;
const dataPort = isConfigured
  ? new SupabaseAdapter(SUPABASE_CONFIG)
  : new MockAdapter();

const app = new App({
  dataPort,
  clockPort: new BrowserClockAdapter(),
  themeEngine: new ThemeEngine('obsidian'),
  zones: buildZoneGraph(),
  thermalResistances: THERMAL_RESISTANCES,
  pollIntervalMs: isConfigured ? POLL_INTERVAL_MS : 30000,
  historyHours: DEFAULT_HISTORY_HOURS,
  isDemo: !isConfigured,
});

app.start().catch(err => {
  document.getElementById('statusBar').innerHTML =
    '<span style="color:red">' + err.message + '<br>' + err.stack + '</span>';
});
