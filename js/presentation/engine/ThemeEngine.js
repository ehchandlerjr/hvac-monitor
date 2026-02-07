/**
 * ThemeEngine — Presentation Service
 * 
 * Manages theme switching with localStorage persistence.
 * Themes are defined purely as CSS custom property sets — adding a new
 * theme means adding a new [data-theme] block in tokens.css and
 * registering it here. No renderer code changes needed.
 * 
 * Open/Closed Principle: open to new themes, closed to modification.
 */

/** @typedef {{ id: string, name: string, description: string }} ThemeMeta */

/** Registry of available themes. Add new themes here. */
const THEME_REGISTRY = [
  { id: 'vellum',       name: 'Vellum',       description: 'Warm parchment — daylight reading' },
  { id: 'obsidian',     name: 'Obsidian',      description: 'Deep dark — nighttime monitoring' },
  { id: 'vesper',       name: 'Vesper',        description: 'Twilight warmth — evening vigil' },
  { id: 'scriptorium',  name: 'Scriptorium',   description: 'Scholar\'s focus — high contrast data' },
];

const STORAGE_KEY = 'hvac-theme';

export class ThemeEngine {
  /** @param {string} defaultThemeId */
  constructor(defaultThemeId = 'vellum') {
    this._themes = THEME_REGISTRY;
    this._currentId = this._loadSaved() || defaultThemeId;
    this._listeners = [];
  }

  /** Get all available themes */
  get themes() {
    return [...this._themes];
  }

  /** Get current theme ID */
  get currentThemeId() {
    return this._currentId;
  }

  /** Apply a theme by ID */
  apply(themeId) {
    if (!this._themes.find(t => t.id === themeId)) {
      console.warn(`[ThemeEngine] Unknown theme: ${themeId}`);
      return;
    }
    this._currentId = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    this._save(themeId);
    this._notify();
  }

  /** Apply the saved theme (call on startup) */
  initialize() {
    this.apply(this._currentId);
  }

  /** Subscribe to theme changes */
  onChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  /** Register a new theme at runtime (for future extensibility) */
  registerTheme(meta) {
    if (!this._themes.find(t => t.id === meta.id)) {
      this._themes.push(meta);
    }
  }

  // ── Private ────────────────────────────────────

  _loadSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  _save(themeId) {
    try { localStorage.setItem(STORAGE_KEY, themeId); } catch { /* noop */ }
  }

  _notify() {
    for (const cb of this._listeners) {
      try { cb(this._currentId); } catch (e) { console.error(e); }
    }
  }
}
