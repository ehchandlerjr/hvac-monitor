/**
 * App — Presentation Orchestrator
 * 
 * Coordinates all renderers. Owns UI state (chart range, etc.)
 * but delegates rendering to individual renderers.
 * 
 * This is the "driving" adapter in hex architecture —
 * it calls use cases, then feeds results to renderers.
 */

import { loadDashboard } from '../../application/usecases/LoadDashboard.js';
import { analyzeZones } from '../../application/usecases/AnalyzeZones.js';
import { renderFloorPlan } from '../renderers/FloorPlanRenderer.js';
import { renderTimeseries } from '../renderers/TimeseriesRenderer.js';
import { renderZoneCards } from '../renderers/ZoneCardRenderer.js';
import { renderAnalysis } from '../renderers/AnalysisRenderer.js';
import { renderStatusBar } from '../renderers/StatusBarRenderer.js';

export class App {
  /**
   * @param {{
   *   dataPort: import('../../application/ports/DataPort.js').DataPort,
   *   clockPort: import('../../application/ports/ClockPort.js').ClockPort,
   *   themeEngine: import('../engine/ThemeEngine.js').ThemeEngine,
   *   zones: import('../../domain/entities/Zone.js').Zone[],
   *   thermalResistances: Map<string, number>,
   *   pollIntervalMs: number,
   *   historyHours: number,
   *   isDemo: boolean,
   * }} deps
   */
  constructor({ dataPort, clockPort, themeEngine, zones, thermalResistances, pollIntervalMs, historyHours, isDemo }) {
    this._dataPort = dataPort;
    this._clockPort = clockPort;
    this._themeEngine = themeEngine;
    this._zones = zones;
    this._thermalResistances = thermalResistances;
    this._pollIntervalMs = pollIntervalMs;
    this._historyHours = historyHours;
    this._isDemo = isDemo;

    // UI state
    this._chartRange = 6; // hours
    this._pollHandle = null;

    // Cache latest results
    this._lastSnapshot = null;
    this._lastAnalysis = null;
  }

  /** Initialize the app: bind DOM, start polling */
  async start() {
    this._bindDOM();
    this._themeEngine.initialize();
    this._bindThemeSwitcher();
    this._bindChartTabs();

    // Initial load
    await this._refresh();

    // Start polling
    this._pollHandle = this._clockPort.scheduleInterval(
      () => this._refresh(),
      this._pollIntervalMs
    );
  }

  /** Stop polling (cleanup) */
  stop() {
    if (this._pollHandle) {
      this._clockPort.cancelInterval(this._pollHandle);
      this._pollHandle = null;
    }
  }

  // ── Private ────────────────────────────────────

  _bindDOM() {
    this._els = {
      floorPlan: document.getElementById('floorPlan'),
      zonesContainer: document.getElementById('zonesContainer'),
      tsChart: document.getElementById('tsChart'),
      tsLegend: document.getElementById('tsLegend'),
      tooltip: document.getElementById('tooltip'),
      analysisGrid: document.getElementById('analysisGrid'),
      deltaGrid: document.getElementById('deltaGrid'),
      statusBar: document.getElementById('statusBar'),
      chartTabs: document.getElementById('chartTabs'),
      themeSwitcher: document.getElementById('themeSwitcher'),
      outdoorBadge: document.getElementById('outdoorBadge'),
      anomalyBanner: document.getElementById('anomalyBanner'),
    };
  }

  _bindThemeSwitcher() {
    if (!this._els.themeSwitcher) return;

    // Render theme buttons
    this._els.themeSwitcher.innerHTML = this._themeEngine.themes.map(t =>
      `<button class="theme-btn ${t.id === this._themeEngine.currentThemeId ? 'active' : ''}" 
              data-theme="${t.id}" title="${t.name}"></button>`
    ).join('');

    this._els.themeSwitcher.addEventListener('click', e => {
      const btn = e.target.closest('.theme-btn');
      if (!btn) return;
      this._themeEngine.apply(btn.dataset.theme);
      this._els.themeSwitcher.querySelectorAll('.theme-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.theme === btn.dataset.theme)
      );
      // Re-render chart (SVG colors come from CSS vars, need fresh render)
      this._renderChart();
    });
  }

  _bindChartTabs() {
    if (!this._els.chartTabs) return;
    this._els.chartTabs.addEventListener('click', e => {
      const tab = e.target.closest('.chart-tab');
      if (!tab) return;
      this._chartRange = parseInt(tab.dataset.range, 10);
      this._els.chartTabs.querySelectorAll('.chart-tab').forEach(t =>
        t.classList.toggle('active', t === tab)
      );
      this._renderChart();
    });
  }

  async _refresh() {
    try {
      // ── Load data ──────────────────────────────
      this._lastSnapshot = await loadDashboard({
        dataPort: this._dataPort,
        clockPort: this._clockPort,
        zones: this._zones,
        hours: this._historyHours,
      });

      // ── Analyze ────────────────────────────────
      this._lastAnalysis = analyzeZones({
        zones: this._lastSnapshot.zones,
        weather: this._lastSnapshot.weather,
        thermalResistances: this._thermalResistances,
      });

      // ── Render everything ──────────────────────
      this._renderAll();

    } catch (err) {
      console.error('[App] Refresh failed:', err);
      if (this._els.statusBar) {
        this._els.statusBar.innerHTML = `<span><span class="status-dot danger"></span>Error: ${err.message}</span>`;
      }
    }
  }

  _renderAll() {
    const { zones, weather, loadedAt, stats } = this._lastSnapshot;
    const analysis = this._lastAnalysis;

    // Outdoor badge
    if (this._els.outdoorBadge && weather) {
      this._els.outdoorBadge.textContent = `Outdoor: ${weather.tempF.toFixed(1)}°F`;
    }

    // Anomaly banner
    if (this._els.anomalyBanner) {
      const serious = analysis.anomalies.filter(a => a.level !== 'info');
      if (serious.length > 0) {
        this._els.anomalyBanner.innerHTML = serious.map(a =>
          `<div class="anomaly-item" data-level="${a.level}">${a.message}</div>`
        ).join('');
        this._els.anomalyBanner.style.display = '';
      } else {
        this._els.anomalyBanner.style.display = 'none';
      }
    }

    // Floor plan
    if (this._els.floorPlan) {
      renderFloorPlan({
        container: this._els.floorPlan,
        zones,
        anomalies: analysis.anomalies,
      });
    }

    // Zone cards
    if (this._els.zonesContainer) {
      renderZoneCards({
        container: this._els.zonesContainer,
        zones,
        weather,
        zoneAnalyses: analysis.zoneAnalyses,
        anomalies: analysis.anomalies,
      });
    }

    // Timeseries chart
    this._renderChart();

    // Analysis grid
    if (this._els.analysisGrid && this._els.deltaGrid) {
      renderAnalysis({
        analysisContainer: this._els.analysisGrid,
        deltaContainer: this._els.deltaGrid,
        analysis,
        weather,
      });
    }

    // Status bar
    if (this._els.statusBar) {
      const coveredCount = zones.filter(z => z.coverageStatus !== 'uncovered').length;
      renderStatusBar({
        container: this._els.statusBar,
        overallStatus: analysis.overallStatus,
        stats,
        loadedAt,
        coveredCount,
        totalZones: zones.length,
        isDemo: this._isDemo,
      });
    }
  }

  _renderChart() {
    if (!this._els.tsChart || !this._lastSnapshot) return;

    renderTimeseries({
      container: this._els.tsChart,
      legendContainer: this._els.tsLegend,
      tooltipEl: this._els.tooltip,
      zones: this._lastSnapshot.zones,
      weather: this._lastSnapshot.weather,
      hours: this._chartRange,
      outdoorSeries: [], // TODO: build outdoor series from readings table
    });
  }
}
