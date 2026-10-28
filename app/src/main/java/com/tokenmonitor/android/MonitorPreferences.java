package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import java.util.LinkedHashSet;

final class MonitorPreferences {
    private final SharedPreferences preferences;
    MonitorPreferences(Context context) { preferences = context.getSharedPreferences("session-monitor", Context.MODE_PRIVATE); }
    boolean enabled() { return preferences.getBoolean("enabled", false); }
    String message() { return preferences.getString("message", "完成提醒未开启"); }
    void state(boolean enabled, String message) {
        if (!preferences.edit().putBoolean("enabled", enabled).putString("message", message).commit()) {
            throw new IllegalStateException("Cannot save monitor state");
        }
    }
    boolean claim(String destination, String eventId) throws Exception {
        String key = ConnectionSpec.digest(destination + "\n" + eventId);
        JSONArray saved = new JSONArray(preferences.getString("delivered", "[]"));
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (int i = 0; i < saved.length(); i++) ids.add(saved.getString(i));
        if (!ids.add(key)) return false;
        while (ids.size() > 512) ids.remove(ids.iterator().next());
        JSONArray next = new JSONArray();
        for (String id : ids) next.put(id);
        if (!preferences.edit().putString("delivered", next.toString()).commit()) throw new IllegalStateException("Cannot save notification ledger");
        return true;
    }
}
