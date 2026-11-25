import type { DisplayPrefs } from '../types/monitor';
import { sanitizeThemePreference } from './themes';

const DISPLAY_PREFS_KEY = 'token-monitor.display-prefs.v1';

export function sanitizeDisplayPrefs(raw: unknown): DisplayPrefs {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    separateQoderClients: input.separateQoderClients === true,
    exactTrendTokens: input.exactTrendTokens === true,
    theme: sanitizeThemePreference(input.theme),
  };
}

export function readInitialNativeDisplayPrefs(): { prefs: DisplayPrefs; systemDark: boolean } | null {
  if (typeof window === 'undefined' || typeof window.HubNative?.initialDisplayPrefs !== 'function') {
    return null;
  }
  try {
    const raw = window.HubNative.initialDisplayPrefs();
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      prefs: sanitizeDisplayPrefs(parsed),
      systemDark: typeof parsed.systemDark === 'boolean' ? parsed.systemDark : true,
    };
  } catch {
    return null;
  }
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
