package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Serialize connection changes and late network results across Activity and JobService. */
final class UsageWidgetStore {
    static final Object LOCK = new Object();

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("usage-widget", Context.MODE_PRIVATE);
    }

    static JSONObject read(Context context) {
        synchronized (LOCK) {
            String binding = new ConnectionStore(context).binding();
            try {
                JSONObject snapshot = new JSONObject(preferences(context).getString("snapshot", "{}"));
                return !binding.isEmpty() && binding.equals(snapshot.optString("binding")) ? snapshot : new JSONObject();
            } catch (Exception ignored) { return new JSONObject(); }
        }
    }

    static boolean publish(Context context, String binding, JSONObject stats, long fetchedAt, long startedAt) {
        synchronized (LOCK) {
            if (binding.isEmpty() || !binding.equals(new ConnectionStore(context).binding())) return false;
            JSONObject previous = read(context);
            if (previous.optLong("startedAt") > startedAt) return false;
            try {
                JSONObject snapshot = UsageWidgetSnapshot.project(stats, fetchedAt, startedAt).put("binding", binding);
                preferences(context).edit().putString("snapshot", snapshot.toString()).apply();
                UsageWidgetProvider.renderAll(context);
                return true;
            } catch (Exception ignored) { return false; }
        }
    }

    static void failed(Context context, String binding, long startedAt, boolean authentication) {
        synchronized (LOCK) {
            if (binding.isEmpty() || !binding.equals(new ConnectionStore(context).binding())) return;
            if (read(context).optLong("startedAt") > startedAt) return;
            try {
                JSONObject snapshot = read(context).put("binding", binding).put("failed", true).put("authentication", authentication);
                preferences(context).edit().putString("snapshot", snapshot.toString()).apply();
                UsageWidgetProvider.renderAll(context);
            } catch (Exception ignored) { }
        }
    }

    static void clear(Context context) {
        synchronized (LOCK) {
            preferences(context).edit().clear().apply();
            UsageWidgetRefreshService.cancel(context);
            UsageWidgetProvider.renderAll(context);
        }
    }
}
