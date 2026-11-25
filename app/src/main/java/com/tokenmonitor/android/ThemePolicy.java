package com.tokenmonitor.android;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Pure Java theme allowlist, system-auto resolution, and native window chrome colors. */
final class ThemePolicy {
    static final String THEME_OBSIDIAN = "obsidian";
    static final String THEME_DAYLIGHT = "daylight";
    static final String THEME_AMBER = "amber";
    static final String THEME_EMERALD = "emerald";
    static final String THEME_NEBULA = "nebula";
    static final String THEME_FROST = "frost";
    static final String THEME_AUTO = "auto";
    static final String DEFAULT_THEME = THEME_OBSIDIAN;

    static final class Spec {
        final String id;
        final boolean isLight;
        final int canvasColor;
        final int statusBarColor;
        final int navBarColor;
        final int fallbackTextColor;

        Spec(String id, boolean isLight, int canvasColor, int statusBarColor, int navBarColor, int fallbackTextColor) {
            this.id = id;
            this.isLight = isLight;
            this.canvasColor = canvasColor;
            this.statusBarColor = statusBarColor;
            this.navBarColor = navBarColor;
            this.fallbackTextColor = fallbackTextColor;
        }
    }

    static final Spec OBSIDIAN = new Spec(THEME_OBSIDIAN, false, 0xFF090C10, 0xFF090C10, 0xFF090C10, 0xFFCBD5E1);
    static final Spec DAYLIGHT = new Spec(THEME_DAYLIGHT, true,  0xFFF4F6F9, 0xFFF4F6F9, 0xFFFFFFFF, 0xFF334155);
    static final Spec AMBER    = new Spec(THEME_AMBER,    false, 0xFF0D0B09, 0xFF0D0B09, 0xFF120F0C, 0xFFD6CBC0);
    static final Spec EMERALD  = new Spec(THEME_EMERALD,  false, 0xFF060E0C, 0xFF060E0C, 0xFF091310, 0xFFC2DBD1);
    static final Spec NEBULA   = new Spec(THEME_NEBULA,   false, 0xFF090914, 0xFF090914, 0xFF0D0D1D, 0xFFCBC9E6);
    static final Spec FROST    = new Spec(THEME_FROST,    true,  0xFFEBF1F8, 0xFFEBF1F8, 0xFFF8FBFF, 0xFF2E4059);

    private static final Map<String, Spec> SPECS;
    static {
        Map<String, Spec> map = new LinkedHashMap<>();
        map.put(THEME_OBSIDIAN, OBSIDIAN);
        map.put(THEME_DAYLIGHT, DAYLIGHT);
        map.put(THEME_AMBER, AMBER);
        map.put(THEME_EMERALD, EMERALD);
        map.put(THEME_NEBULA, NEBULA);
        map.put(THEME_FROST, FROST);
        SPECS = Collections.unmodifiableMap(map);
    }

    private ThemePolicy() { }

    static boolean isSupportedPreference(String value) {
        return value != null && (THEME_AUTO.equals(value) || SPECS.containsKey(value));
    }

    static String sanitize(String raw) {
        if (raw == null) return DEFAULT_THEME;
        String trimmed = raw.trim();
        return isSupportedPreference(trimmed) ? trimmed : DEFAULT_THEME;
    }

    static String resolveId(String preference, boolean systemDark) {
        String clean = sanitize(preference);
        if (THEME_AUTO.equals(clean)) return systemDark ? THEME_OBSIDIAN : THEME_DAYLIGHT;
        return clean;
    }

    static Spec specFor(String resolvedId) {
        if (resolvedId == null) return OBSIDIAN;
        Spec spec = SPECS.get(resolvedId);
        return spec != null ? spec : OBSIDIAN;
    }

    static Spec resolve(String preference, boolean systemDark) {
        return specFor(resolveId(preference, systemDark));
    }
}
