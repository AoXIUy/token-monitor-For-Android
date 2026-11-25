package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

final class DisplayPrefs {
    private static final String PREFS = "display-prefs";
    private static final String KEY = "prefs";

    private DisplayPrefs() { }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject sanitize(JSONObject parsed) throws Exception {
        String rawTheme = null;
        if (parsed != null && parsed.has("theme") && !parsed.isNull("theme")) {
            Object candidate = parsed.opt("theme");
            if (candidate instanceof String) rawTheme = (String) candidate;
        }
        return new JSONObject()
                .put("separateQoderClients", parsed != null && parsed.optBoolean("separateQoderClients", false))
                .put("exactTrendTokens", parsed != null && parsed.optBoolean("exactTrendTokens", false))
                .put("theme", ThemePolicy.sanitize(rawTheme));
    }

    static JSONObject load(Context context) {
        String raw = preferences(context).getString(KEY, "");
        if (raw == null || raw.isEmpty()) {
            try { return sanitize(null); } catch (Exception ignored) { return new JSONObject(); }
        }
        try { return sanitize(new JSONObject(raw)); }
        catch (Exception ignored) {
            try { return sanitize(null); } catch (Exception err) { return new JSONObject(); }
        }
    }

    static boolean separateQoderClients(Context context) {
        return load(context).optBoolean("separateQoderClients", false);
    }

    static String theme(Context context) {
        return ThemePolicy.sanitize(load(context).optString("theme", ThemePolicy.DEFAULT_THEME));
    }

    static boolean save(Context context, String serialized) {
        if (serialized == null || serialized.length() > 8192) return false;
        try {
            JSONObject clean = sanitize(new JSONObject(serialized));
            preferences(context).edit().putString(KEY, clean.toString()).apply();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
