package com.tokenmonitor.android;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.time.Instant;
import java.util.List;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class CompletionProjectionTest {
    private static final long NOW = 1_800_000_000_000L;
    private static JSONObject session(long age, boolean ended) throws Exception {
        return new JSONObject().put("client", "codex").put("sessionId", "a").put("title", "Sample")
                .put("lastUsedAt", Instant.ofEpochMilli(NOW - age).toString()).put("turnEnded", ended);
    }
    private static JSONObject device(String id, JSONObject row) throws Exception {
        JSONObject period = new JSONObject().put("sessions", new JSONObject().put("codex:a", row));
        return new JSONObject().put("deviceId", id).put("updatedAt", Instant.ofEpochMilli(NOW).toString())
                .put("stale", false).put("periods", new JSONObject().put("month", period).put("today", period));
    }
    private static List<SessionCompletionTracker.Observation> read(JSONObject... devices) throws Exception {
        JSONArray values = new JSONArray();
        for (JSONObject device : devices) values.put(device);
        return CompletionObservations.fromStats(new JSONObject().put("devices", values), NOW);
    }

    @Test public void deduplicatesPeriodsAndDevicesWithoutInventingActivity() throws Exception {
        JSONObject older = device("old", session(10000, false));
        JSONObject newer = device("new", session(1000, true));
        List<SessionCompletionTracker.Observation> values = read(older, newer);
        assertEquals(1, values.size());
        assertTrue(values.get(0).ended);
        assertFalse(values.get(0).active);
        JSONObject noBoundary = session(1000, false);
        noBoundary.remove("turnEnded");
        assertFalse(read(device("pc", noBoundary)).get(0).active);
        noBoundary.put("waitingForInput", true);
        assertTrue(read(device("pc", noBoundary)).get(0).active);
    }

    @Test public void rejectsStaleArchivedFutureAndExpiredRecords() throws Exception {
        assertTrue(read(device("old", session(1000, true)).put("stale", true)).isEmpty());
        assertTrue(read(device("pc", session(1000, true).put("archived", true))).isEmpty());
        assertTrue(read(device("pc", session(-1000, true))).isEmpty());
        assertTrue(read(device("pc", session(1000000, true))).isEmpty());
        JSONObject expired = device("pc", session(1000, false)).put("periodWindows", new JSONObject()
                .put("today", new JSONObject().put("endsAt", Instant.ofEpochMilli(NOW - 1).toString()))
                .put("month", new JSONObject().put("endsAt", Instant.ofEpochMilli(NOW - 1).toString())));
        assertTrue(read(expired).isEmpty());
    }

    @Test public void freshNativeActivityCanOutliveAccountingButAnOldEndCannotFinishIt() throws Exception {
        JSONObject row = session(1200000, true).put("liveActivity", new JSONObject()
                .put("state", "running").put("observedAt", Instant.ofEpochMilli(NOW - 1000).toString()));
        SessionCompletionTracker.Observation value = read(device("pc", row)).get(0);
        assertTrue(value.active);
        assertFalse(value.ended);
        assertEquals(NOW - 1000, value.completionFloor);
        row.getJSONObject("liveActivity").put("observedAt", Instant.ofEpochMilli(NOW - 30000).toString());
        assertTrue(read(device("pc", row)).isEmpty());
    }
}
