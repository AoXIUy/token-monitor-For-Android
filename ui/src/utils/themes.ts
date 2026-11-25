import type { ThemeId, ThemePreference } from '../types/monitor';
import {
  DEFAULT_THEME_PREFERENCE,
  isLightTheme,
  resolveThemeId,
  sanitizeThemePreference,
  THEME_IDS,
  THEME_PREFERENCES,
} from '../nativeState';

export {
  DEFAULT_THEME_PREFERENCE,
  isLightTheme,
  resolveThemeId,
  sanitizeThemePreference,
  THEME_IDS,
  THEME_PREFERENCES,
};
export type { ThemeId, ThemePreference };

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  subtitle: string;
  isLight: boolean;
  polarityLabel: string;
  swatches: {
    canvas: string;
    surface: string;
    hero: string;
    border: string;
    textPrimary: string;
    textMuted: string;
    accent: string;
    accentSecondary: string;
  };
}

export const THEME_CATALOG: readonly ThemeMeta[] = [
  {
    id: 'obsidian',
    name: '深空遥测',
    subtitle: 'Obsidian',
    isLight: false,
    polarityLabel: '深色',
    swatches: {
      canvas: '#090C10',
      surface: '#111822',
      hero: '#101926',
      border: 'rgba(255, 255, 255, 0.14)',
      textPrimary: '#F4F8FC',
      textMuted: '#8B9BB4',
      accent: '#38BDF8',
      accentSecondary: '#34D399',
    },
  },
  {
    id: 'daylight',
    name: '晴空纸韵',
    subtitle: 'Daylight',
    isLight: true,
    polarityLabel: '浅色',
    swatches: {
      canvas: '#F4F6F9',
      surface: '#FFFFFF',
      hero: '#FFFFFF',
      border: 'rgba(15, 23, 42, 0.12)',
      textPrimary: '#0F172A',
      textMuted: '#52627A',
      accent: '#0369A1',
      accentSecondary: '#047857',
    },
  },
  {
    id: 'amber',
    name: '琥珀终端',
    subtitle: 'Amber',
    isLight: false,
    polarityLabel: '深色',
    swatches: {
      canvas: '#0D0B09',
      surface: '#171310',
      hero: '#1B1510',
      border: 'rgba(255, 238, 214, 0.16)',
      textPrimary: '#FAF5EE',
      textMuted: '#A19385',
      accent: '#F59E0B',
      accentSecondary: '#FB923C',
    },
  },
  {
    id: 'emerald',
    name: '翠影幽境',
    subtitle: 'Emerald',
    isLight: false,
    polarityLabel: '深色',
    swatches: {
      canvas: '#060E0C',
      surface: '#0D1916',
      hero: '#0D1E19',
      border: 'rgba(204, 251, 241, 0.16)',
      textPrimary: '#EFFCF7',
      textMuted: '#85A69A',
      accent: '#2DD4BF',
      accentSecondary: '#4ADE80',
    },
  },
  {
    id: 'nebula',
    name: '暮霞紫境',
    subtitle: 'Nebula',
    isLight: false,
    polarityLabel: '深色',
    swatches: {
      canvas: '#090914',
      surface: '#121226',
      hero: '#15142E',
      border: 'rgba(233, 213, 255, 0.18)',
      textPrimary: '#F4F3FF',
      textMuted: '#9290B8',
      accent: '#A78BFA',
      accentSecondary: '#38BDF8',
    },
  },
  {
    id: 'frost',
    name: '冰川薄雾',
    subtitle: 'Frost',
    isLight: true,
    polarityLabel: '浅色',
    swatches: {
      canvas: '#EBF1F8',
      surface: '#F8FBFF',
      hero: '#F8FBFF',
      border: 'rgba(14, 27, 46, 0.13)',
      textPrimary: '#0E1B2E',
      textMuted: '#4C607D',
      accent: '#4F46E5',
      accentSecondary: '#0F766E',
    },
  },
];

const THEME_BY_ID: Record<ThemeId, ThemeMeta> = Object.fromEntries(
  THEME_CATALOG.map((meta) => [meta.id, meta]),
) as Record<ThemeId, ThemeMeta>;

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEME_BY_ID[id] || THEME_BY_ID.obsidian;
}

export function detectBrowserSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

let themeTransitionTimer: number | null = null;

export function applyDocumentTheme(resolvedId: ThemeId, animate = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const light = isLightTheme(resolvedId);
  const colorMode = light ? 'light' : 'dark';
  const previous = root.dataset.theme;

  if (animate && previous && previous !== resolvedId && typeof window !== 'undefined') {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      root.classList.add('tm-theme-transitioning');
      if (themeTransitionTimer !== null) window.clearTimeout(themeTransitionTimer);
      themeTransitionTimer = window.setTimeout(() => {
        root.classList.remove('tm-theme-transitioning');
        themeTransitionTimer = null;
      }, 180);
    }
  }

  root.dataset.theme = resolvedId;
  root.dataset.colorMode = colorMode;

  const meta =
    document.getElementById('tm-color-scheme') ||
    document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', colorMode);
  }
}
