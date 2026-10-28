package com.tokenmonitor.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;

final class CompletionObservations {
    static long timestamp(String value) {
        try { return Instant.parse(value).toEpochMilli(); } catch (Exception ignored) { return 0; }
    }

    static List<SessionCompletionTracker.Observation> fromStats(JSONObject stats, long now) {
        LinkedHashMap<String, SessionCompletionTracker.Observation> rows = new LinkedHashMap<>();
        JSONArray devices = stats.optJSONArray("devices");
        if (devices == null) return new ArrayList<>();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device == null || device.optBoolean("stale")) continue;
            JSONObject periods = device.optJSONObject("periods");
            if (periods == null) continue;
            for (String period : new String[] {"month", "today"}) {
                JSONObject windows = device.optJSONObject("periodWindows");
                JSONObject window = windows == null ? null : windows.optJSONObject(period);
                long endsAt = window == null ? 0 : timestamp(window.optString("endsAt"));
                if (endsAt > 0 && now >= endsAt) continue;
                if (endsAt == 0) {
                    long updated = timestamp(device.optString("updatedAt"));
                    if (updated <= 0) continue;
                    int length = "today".equals(period) ? 10 : 7;
                    if (!Instant.ofEpochMilli(updated).toString().substring(0, length)
                            .equals(Instant.ofEpochMilli(now).toString().substring(0, length))) continue;
                }
                JSONObject data = periods.optJSONObject(period);
                JSONObject sessions = data == null ? null : data.optJSONObject("sessions");
                if (sessions == null) continue;
                Iterator<String> keys = sessions.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    JSONObject session = sessions.optJSONObject(key);
                    if (session == null || session.optBoolean("archived") || session.optBoolean("deleted")
                            || session.optBoolean("sourceDeleted")) continue;
                    long last = timestamp(session.optString("lastUsedAt"));
                    if (last <= 0 || last > now) continue;
                    String client = session.optString("client");
                    JSONObject live = session.optJSONObject("liveActivity");
                    long observed = live == null ? 0 : timestamp(live.optString("observedAt"));
                    String state = live == null ? "unknown" : live.optString("state", "unknown");
                    boolean validLive = ("claude".equals(client) || "codex".equals(client)) && observed > 0
                            && observed <= now && now - observed < 30_000 && !"unknown".equals(state)
                            && ("running".equals(state) || "waiting".equals(state) || "idle".equals(state));
                    boolean openTurn = Boolean.FALSE.equals(session.opt("turnEnded"));
                    if (!validLive && now - last > SessionCompletionTracker.MAX_END_AGE_MS) continue;
                    boolean questionWaiting = "codex".equals(client) && Boolean.TRUE.equals(session.opt("waitingForInput"))
                            && !Boolean.TRUE.equals(session.opt("turnEnded"));
                    boolean active = validLive ? ("running".equals(state) || "waiting".equals(state)) : openTurn || questionWaiting;
                    boolean ended = Boolean.TRUE.equals(session.opt("turnEnded")) && !active;
                    long evidence = validLive ? Math.max(last, observed) : last;
                    long floor = openTurn || questionWaiting ? last : Math.max(last, validLive ? observed : 0);
                    String label = session.optString("title", "");
                    if (label.isEmpty()) label = session.optString("projectLabel", "");
                    if (label.isEmpty()) label = session.optString("sessionId", key);
                    SessionCompletionTracker.Observation candidate = new SessionCompletionTracker.Observation(
                            key, client, label, last, evidence, floor, active, ended);
                    SessionCompletionTracker.Observation previous = rows.get(key);
                    if (previous == null || evidence > previous.evidenceAt
                            || (evidence == previous.evidenceAt && ended && !previous.ended)) rows.put(key, candidate);
                }
            }
        }
        return new ArrayList<>(rows.values());
    }
}
