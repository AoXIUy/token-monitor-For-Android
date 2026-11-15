import type { DisplayPrefs } from '../types/monitor';

const DISPLAY_PREFS_KEY = 'token-monitor.display-prefs.v1';

export function sanitizeDisplayPrefs(raw: unknown): DisplayPrefs {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    separateQoderClients: input.separateQoderClients === true,
  };
}

export function loadBrowserDisplayPrefs(): DisplayPrefs {
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFS_KEY);
    if (!raw) return sanitizeDisplayPrefs(null);
    return sanitizeDisplayPrefs(JSON.parse(raw));
  } catch {
    return sanitizeDisplayPrefs(null);
  }
}

export function saveBrowserDisplayPrefs(prefs: DisplayPrefs): void {
  const clean = sanitizeDisplayPrefs(prefs);
  try {
    window.localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota or sandbox restrictions in browser preview mode.
  }
}
