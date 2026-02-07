/**
 * main.js — Composition Root
 * 
 * THE ONLY FILE that knows about concrete implementations.
 * This is where dependency injection happens.
 * 
 * ┌─────────────────────────────────────────────────┐
 * │  Wire diagram:                                   │
 * │                                                  │
 * │  SensorRegistry ──→ Zone[]                       │
 * │                      ↓                           │
 * │  DataPort (Supabase or Mock)                     │
 * │       ↓                                          │
 * │  LoadDashboard (use case) ──→ DashboardSnapshot  │
 * │       ↓                                          │
 * │  AnalyzeZones (use case) ──→ AnalysisResult      │
 * │       ↓                                          │
 * │  App (presentation) ──→ Renderers ──→ DOM        │
 * └─────────────────────────────────────────────────┘
 */

import { SupabaseAdapter } from './infrastructure/adapters/SupabaseAdapter.js';
import { MockAdapter } from './infrastructure/adapters/MockAdapter.js';
import { BrowserClockAdapter } from './infrastructure/adapters/BrowserClockAdapter.js';
import {
  SUPABASE_CONFIG,
  POLL_INTERVAL_MS,
  DEFAULT_HISTORY_HOURS,
  THERMAL_RESISTANCES,
  buildZoneGraph,
} from './infrastructure/config/SensorRegistry.js';
import { ThemeEngine } from './presentation/engine/ThemeEngine.js';
import { App } from './presentation/App.js';

// ── Decide which adapter to use ──────────────────
const isConfigured = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey;
const isDemo = !isConfigured;

const dataPort = isConfigured
  ? new SupabaseAdapter({
      url: SUPABASE_CONFIG.url,
      anonKey: SUPABASE_CONFIG.anonKey,
      tableName: SUPABASE_CONFIG.tableName,
    })
  : new MockAdapter();

if (isDemo) {
  console.log('[main] No Supabase config — running in demo mode with mock data');
} else {
  console.log(`[main] Connected to Supabase: ${SUPABASE_CONFIG.url}`);
}

// ── Build domain graph ───────────────────────────
const zones = buildZoneGraph();

// ── Wire up and start ────────────────────────────
const app = new App({
  dataPort,
  clockPort: new BrowserClockAdapter(),
  themeEngine: new ThemeEngine('vellum'),
  zones,
  thermalResistances: THERMAL_RESISTANCES,
  pollIntervalMs: isDemo ? 30_000 : POLL_INTERVAL_MS, // Faster in demo
  historyHours: DEFAULT_HISTORY_HOURS,
  isDemo,
});

app.start().catch(err => console.error('[main] Failed to start:', err));
