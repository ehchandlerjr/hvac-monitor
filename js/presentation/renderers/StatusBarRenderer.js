/**
 * StatusBarRenderer — Presentation Renderer
 * 
 * Renders the bottom status bar showing system health.
 */

/**
 * @param {{
 *   container: HTMLElement,
 *   overallStatus: 'ok'|'info'|'warning'|'danger',
 *   stats: { total: number, loaded: number, failed: string[] },
 *   loadedAt: Date,
 *   coveredCount: number,
 *   totalZones: number,
 *   isDemo: boolean,
 * }} params
 */
export function renderStatusBar({ container, overallStatus, stats, loadedAt, coveredCount, totalZones, isDemo }) {
  const dotClass = overallStatus === 'danger' ? 'danger'
                 : overallStatus === 'warning' ? 'warning'
                 : overallStatus === 'ok' ? 'ok'
                 : 'offline';

  let statusText;
  if (isDemo) {
    statusText = 'Demo mode — configure Supabase to see live data';
  } else if (stats.failed.length > 0) {
    statusText = `Partial load — failed: ${stats.failed.join(', ')}`;
  } else if (coveredCount < totalZones) {
    statusText = `Partial — ${coveredCount}/${totalZones} zones reporting`;
  } else {
    statusText = `All ${totalZones} zones reporting`;
  }

  const timeStr = loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  container.innerHTML = `
    <span><span class="status-dot ${dotClass}"></span>${statusText}</span>
    <span>Updated ${timeStr} · ${stats.total} readings</span>
  `;
}
