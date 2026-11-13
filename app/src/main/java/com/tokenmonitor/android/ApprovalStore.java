package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import java.util.LinkedHashSet;

/** Stores opt-in read-only approval alert toggle, status text, and single-shot delivery ledger. */
final class ApprovalStore {
    private static final int MAX_DELIVERED = 128;
    private final SharedPreferences preferences;

    ApprovalStore(Context context) {
        preferences = context.getSharedPreferences("approval-alerts", Context.MODE_PRIVATE);
    }

    synchronized boolean enabled() {
        return preferences.getBoolean("enabled", false);
    }

    synchronized String status() {
        return preferences.getString("status", enabled() ? "ok" : "off");
    }

    synchronized String message() {
        return preferences.getString("message", enabled() ? "正在连接审批提醒…" : "审批提醒未开启");
    }

    synchronized void saveState(boolean enabled, String status, String message) {
        if (!preferences.edit()
                .putBoolean("enabled", enabled)
                .putString("status", status == null ? "" : status)
                .putString("message", message == null ? "" : message)
                .commit()) {
            throw new IllegalStateException("Cannot save approval alert state");
        }
    }

    synchronized boolean claim(String destination, String alertId) {
        try {
            String key = ConnectionSpec.digest(destination + "\n" + alertId);
            JSONArray saved = new JSONArray(preferences.getString("delivered", "[]"));
            LinkedHashSet<String> ids = new LinkedHashSet<>();
            for (int i = 0; i < saved.length(); i++) ids.add(saved.getString(i));
            if (!ids.add(key)) return false;
            while (ids.size() > MAX_DELIVERED) ids.remove(ids.iterator().next());
            JSONArray next = new JSONArray();
            for (String id : ids) next.put(id);
            return preferences.edit().putString("delivered", next.toString()).commit();
        } catch (Exception ignored) {
            return true;
        }
    }

    synchronized void clear() {
        if (!preferences.edit().clear().commit()) {
            throw new IllegalStateException("Cannot clear approval alert state");
        }
    }
}
