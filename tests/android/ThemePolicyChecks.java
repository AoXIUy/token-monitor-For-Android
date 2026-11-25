package com.tokenmonitor.android;

public final class ThemePolicyChecks {
    private static int checks;

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("Theme policy check " + (checks + 1) + " failed");
        checks++;
    }

    public static void main(String[] args) {
        for (String valid : new String[] {
                ThemePolicy.THEME_OBSIDIAN, ThemePolicy.THEME_DAYLIGHT, ThemePolicy.THEME_AMBER,
                ThemePolicy.THEME_EMERALD, ThemePolicy.THEME_NEBULA, ThemePolicy.THEME_FROST,
                ThemePolicy.THEME_AUTO
        }) {
            check(ThemePolicy.isSupportedPreference(valid));
            check(valid.equals(ThemePolicy.sanitize(valid)));
            check(valid.equals(ThemePolicy.sanitize("  " + valid + "  ")));
        }

        for (String invalid : new String[] {
                null, "", "   ", "dark", "light", "OBSIDIAN", "DAYLIGHT", "system",
                "obsidian;background:red", "../obsidian", "unknown"
        }) {
            check(!ThemePolicy.isSupportedPreference(invalid));
            check(ThemePolicy.DEFAULT_THEME.equals(ThemePolicy.sanitize(invalid)));
        }

        // Auto resolves dynamically from systemDark.
        check(ThemePolicy.THEME_OBSIDIAN.equals(ThemePolicy.resolveId(ThemePolicy.THEME_AUTO, true)));
        check(ThemePolicy.THEME_DAYLIGHT.equals(ThemePolicy.resolveId(ThemePolicy.THEME_AUTO, false)));
        check(ThemePolicy.resolve(ThemePolicy.THEME_AUTO, true) == ThemePolicy.OBSIDIAN);
        check(ThemePolicy.resolve(ThemePolicy.THEME_AUTO, false) == ThemePolicy.DAYLIGHT);

        // Explicit presets ignore systemDark.
        check(ThemePolicy.resolve(ThemePolicy.THEME_DAYLIGHT, true) == ThemePolicy.DAYLIGHT);
        check(ThemePolicy.resolve(ThemePolicy.THEME_AMBER, false) == ThemePolicy.AMBER);
        check(ThemePolicy.resolve(ThemePolicy.THEME_FROST, true) == ThemePolicy.FROST);
        check(ThemePolicy.resolve(null, false) == ThemePolicy.OBSIDIAN);
        check(ThemePolicy.specFor("invalid") == ThemePolicy.OBSIDIAN);

        // Exact native window chrome colors & polarity contract.
        check(!ThemePolicy.OBSIDIAN.isLight
                && ThemePolicy.OBSIDIAN.canvasColor == 0xFF090C10
                && ThemePolicy.OBSIDIAN.statusBarColor == 0xFF090C10
                && ThemePolicy.OBSIDIAN.navBarColor == 0xFF090C10
                && ThemePolicy.OBSIDIAN.fallbackTextColor == 0xFFCBD5E1);

        check(ThemePolicy.DAYLIGHT.isLight
                && ThemePolicy.DAYLIGHT.canvasColor == 0xFFF4F6F9
                && ThemePolicy.DAYLIGHT.statusBarColor == 0xFFF4F6F9
                && ThemePolicy.DAYLIGHT.navBarColor == 0xFFFFFFFF
                && ThemePolicy.DAYLIGHT.fallbackTextColor == 0xFF334155);

        check(!ThemePolicy.AMBER.isLight
                && ThemePolicy.AMBER.canvasColor == 0xFF0D0B09
                && ThemePolicy.AMBER.statusBarColor == 0xFF0D0B09
                && ThemePolicy.AMBER.navBarColor == 0xFF120F0C
                && ThemePolicy.AMBER.fallbackTextColor == 0xFFD6CBC0);

        check(!ThemePolicy.EMERALD.isLight
                && ThemePolicy.EMERALD.canvasColor == 0xFF060E0C
                && ThemePolicy.EMERALD.statusBarColor == 0xFF060E0C
                && ThemePolicy.EMERALD.navBarColor == 0xFF091310
                && ThemePolicy.EMERALD.fallbackTextColor == 0xFFC2DBD1);

        check(!ThemePolicy.NEBULA.isLight
                && ThemePolicy.NEBULA.canvasColor == 0xFF090914
                && ThemePolicy.NEBULA.statusBarColor == 0xFF090914
                && ThemePolicy.NEBULA.navBarColor == 0xFF0D0D1D
                && ThemePolicy.NEBULA.fallbackTextColor == 0xFFCBC9E6);

        check(ThemePolicy.FROST.isLight
                && ThemePolicy.FROST.canvasColor == 0xFFEBF1F8
                && ThemePolicy.FROST.statusBarColor == 0xFFEBF1F8
                && ThemePolicy.FROST.navBarColor == 0xFFF8FBFF
                && ThemePolicy.FROST.fallbackTextColor == 0xFF2E4059);

        System.out.println(checks + " theme policy checks passed");
    }
}
