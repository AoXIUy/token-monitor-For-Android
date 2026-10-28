package com.tokenmonitor.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/** Bounded, display-only projection: never persist Hub sessions, names or credentials. */
final class UsageWidgetSnapshot {
    private UsageWidgetSnapshot() { }

    static JSONObject project(JSONObject stats, long fetchedAt, long startedAt) throws Exception {
        JSONObject periods = stats.optJSONObject("periods");
        JSONObject today = periods == null ? null : periods.optJSONObject("today");
        JSONArray devices = stats.optJSONArray("devices");
        if (today == null || devices == null || number(today, "totalTokens") == null) {
            throw new IllegalArgumentException("Missing today usage");
        }
        double total = count(today, "totalTokens");
        JSONObject capabilities = today.optJSONObject("capabilities");
        Double cost = number(today, "costUsd");
        int reporting = 0;
        for (int i = 0; i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device != null && device.has("stale") && !device.optBoolean("stale", true)) reporting++;
        }
        JSONObject result = new JSONObject().put("fetchedAt", fetchedAt).put("startedAt", startedAt)
                .put("tokens", compact(total)).put("cost", cost == null ? "—" : String.format(Locale.US, "$%.2f", cost))
                .put("partialCost", count(today, "unpricedTokens") > 0)
                .put("devices", reporting + " / " + devices.length()).put("cache", "—");
        if (capabilities != null && Boolean.TRUE.equals(capabilities.opt("tokenComponents"))) {
            double percent = total > 0 ? Math.min(100, count(today, "cacheReadTokens") / total * 100) : 0;
            result.put("cache", String.format(Locale.US, "%.1f%%", percent));
        }
        return result;
    }

    private static Double number(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (!(raw instanceof Number)) return null;
        double number = ((Number) raw).doubleValue();
        return Double.isFinite(number) && number >= 0 ? number : null;
    }

    private static double count(JSONObject value, String key) {
        Double number = number(value, key);
        return number == null ? 0 : number;
    }

    // Match the shared formatter's western units and rounded-unit promotion.
    static String compact(double value) {
        double[] divisors = {1e3, 1e6, 1e9};
        String[] suffixes = {"K", "M", "B"};
        if (value < 1000) return String.format(Locale.US, "%.0f", value);
        int index = value >= 1e9 ? 2 : value >= 1e6 ? 1 : 0;
        double scaled = Math.round(value / divisors[index] * 10) / 10.0;
        if (scaled >= 1000 && index < 2) scaled = Math.round(value / divisors[++index] * 10) / 10.0;
        return String.format(Locale.US, "%.1f", scaled).replaceAll("\\.0$", "") + suffixes[index];
    }
}
