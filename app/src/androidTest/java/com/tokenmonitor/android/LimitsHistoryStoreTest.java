package com.tokenmonitor.android;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.time.LocalDate;
import java.time.ZoneId;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class LimitsHistoryStoreTest {
    private Context context;
    private LimitsHistoryStore store;
    private long now;

    @Before public void createHistory() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(LimitsHistoryStore.DATABASE);
        store = new LimitsHistoryStore(context, "hub-a");
        now = LocalDate.of(2026, 11, 5).atTime(10, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
    @After public void closeHistory() { store.close(); context.deleteDatabase(LimitsHistoryStore.DATABASE); }

    private JSONObject provider(String account, String source, long at, double used) throws Exception {
        return new JSONObject().put("provider", "opendesign").put("accountKey", account).put("source", "web")
                .put("sourceDeviceId", source).put("accountName", "Private workspace").put("accountEmail", "private@example.invalid")
                .put("status", "ok").put("updatedAt", java.time.Instant.ofEpochMilli(at).toString())
                .put("windows", new JSONArray().put(new JSONObject().put("kind", "session").put("label", "Session")
                        .put("usedPercent", used).put("limit", 100).put("windowMinutes", 300)
                        .put("resetsAt", java.time.Instant.ofEpochMilli(now + 4 * 3600000).toString())));
    }
    private JSONObject record(JSONObject... providers) throws Exception {
        JSONObject stats = new JSONObject().put("limits", new JSONObject().put("providers", new JSONArray(java.util.Arrays.asList(providers))));
        store.record(stats, now + 24 * 3600000);
        return stats;
    }
    private JSONObject entry(JSONObject provider, long at) throws Exception { return store.query(provider, at).getJSONArray("windows").getJSONObject(0); }
    private JSONObject today(JSONObject provider, long at) throws Exception { return entry(provider, at).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13); }

    @Test public void minimaxCodeAndApiStaySeparateEvenWhenDisplayAffiliationExists() throws Exception {
        JSONObject code = provider("shared-legacy-key", "laptop", now, 20).put("provider", "minimax").put("source", "oauth").put("region", "cn");
        code.put("windows", new JSONArray().put(new JSONObject().put("kind", "billing").put("metric", "credits")
                .put("label", "Credits").put("remaining", 4624).put("currency", "CREDITS")));
        JSONObject api = new JSONObject(code.toString()).put("source", "api").put("relatedAccountKey", code.getString("accountKey"));
        api.put("windows", new JSONArray().put(new JSONObject().put("kind", "billing").put("metric", "credits")
                .put("label", "Balance").put("remaining", 14.97).put("currency", "CNY")));
        record(code, api);
        assertNotEquals(code.getString("androidHistoryKey"), api.getString("androidHistoryKey"));
        assertEquals("CREDITS", entry(code, now).getString("unit"));
        assertEquals("CNY", entry(api, now).getString("unit"));
        JSONObject unlimited = new JSONObject().put("kind", "session").put("detail", "unlimited").put("usedPercent", 0);
        assertTrue(LimitsHistoryStore.readings(unlimited).isEmpty());
        JSONObject video = new JSONObject().put("kind", "weekly").put("label", "Video")
                .put("resetsAt", java.time.Instant.ofEpochMilli(now + 7200000).toString());
        assertEquals(now - 14 * 86400000L, LimitsHistoryStore.trendStart("minimax", video, now));
        video.put("windowMinutes", 120);
        assertEquals(now, LimitsHistoryStore.trendStart("minimax", video, now));
    }

    @Test public void qoderPoolsAndHarkSpendKeepIndependentHistoryStreams() throws Exception {
        JSONObject qoder = provider("qoder", "pc", now, 20).put("provider", "qoder");
        qoder.put("windows", new JSONArray()
                .put(new JSONObject().put("kind", "billing").put("label", "Credits").put("usedPercent", 20).put("limit", 100))
                .put(new JSONObject().put("kind", "billing").put("label", "Team credits").put("usedPercent", 20).put("limit", 50)));
        JSONObject hark = provider("hark", "pc", now, 12).put("provider", "hark");
        hark.put("windows", new JSONArray()
                .put(new JSONObject().put("kind", "daily").put("label", "Daily").put("usedPercent", 12).put("limit", 10000))
                .put(new JSONObject().put("kind", "billing").put("label", "Top-up").put("metric", "spend").put("used", 1.25).put("currency", "USD").put("showMeter", false)));
        record(qoder, hark);
        qoder.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        qoder.getJSONArray("windows").getJSONObject(0).put("usedPercent", 40); record(qoder);
        store.close(); store = new LimitsHistoryStore(context, "hub-a");
        JSONArray rows = store.query(qoder, now + 60000).getJSONArray("windows");
        assertEquals(2, rows.length());
        assertEquals(20, rows.getJSONObject(0).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13).getDouble("value"), 0);
        assertEquals(0, rows.getJSONObject(1).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13).getDouble("value"), 0);
        rows = store.query(hark, now + 60000).getJSONArray("windows");
        assertEquals("pp", rows.getJSONObject(0).getString("unit"));
        assertEquals("USD", rows.getJSONObject(1).getString("unit"));
    }

    @Test public void repeatedCompatibleHandoffsPreserveNetChangeAfterReopening() throws Exception {
        for (boolean failed : new boolean[]{false, true}) {
            store.close(); context.deleteDatabase(LimitsHistoryStore.DATABASE);
            store = new LimitsHistoryStore(context, "hub-a");
            record(provider("workspace-a", "a", now, 54));
            record(provider("workspace-a", "a", now + 5 * 60000, 55));
            if (failed) record(provider("workspace-a", "a", now + 6 * 60000, 55).put("status", "unavailable"));
            JSONObject p = provider("workspace-a", "b", now + (failed ? 10 : 40) * 60000, 56); record(p);
            store.close(); store = new LimitsHistoryStore(context, "hub-a");
            if (failed) record(provider("workspace-a", "b", now + 11 * 60000, 56).put("status", "unavailable"));
            record(provider("workspace-a", "a", now + (failed ? 15 : 75) * 60000, 56));
            if (failed) record(provider("workspace-a", "a", now + 16 * 60000, 56).put("status", "unavailable"));
            long end = now + (failed ? 20 : 110) * 60000;
            p = provider("workspace-a", "b", end, 58); record(p);
            store.close(); store = new LimitsHistoryStore(context, "hub-a");
            JSONObject result = entry(p, end).getJSONObject("distribution");
            assertEquals(4, today(p, end).getDouble("value"), 0);
            assertTrue(today(p, end).getBoolean("uncertain"));
            assertEquals(0, result.getDouble("unallocated"), 0);
            assertEquals(0, result.getInt("resets"));
            assertEquals(5, entry(p, end).getJSONArray("points").length());
            assertEquals(0, android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(), "SELECT guarded FROM streams LIMIT 1", null));
        }
    }

    @Test public void storedLegacyConflictNoLongerBlocksCompatibleSourceJump() throws Exception {
        JSONObject p = provider("workspace-a", "a", now, 20); record(p);
        store.getWritableDatabase().execSQL("UPDATE streams SET guarded=1");
        record(provider("workspace-a", "a", now + 60000, 20).put("status", "unavailable"));
        p = provider("workspace-a", "b", now + 120000, 24); record(p);
        assertEquals(4, today(p, now + 120000).getDouble("value"), 0);
        assertEquals(0, android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(), "SELECT guarded FROM streams LIMIT 1", null));
    }

    @Test public void repeatedAndOutOfOrderObservationsDoNotBecomeNewConsumption() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20);
        record(p); record(p); record(provider("workspace-a", "laptop", now - 1000, 15));
        assertTrue(today(p, now).isNull("value"));
        assertEquals(1, today(p, now).getInt("observations"));
        p = provider("workspace-a", "laptop", now + 60000, 24); record(p);
        assertEquals(4, today(p, now + 60000).getDouble("value"), 0);
        assertEquals(2, today(p, now + 60000).getInt("observations"));
        assertTrue(store.query(p, now + 60000).getBoolean("persistent"));
    }

    @Test public void localSqliteSurvivesReopeningAndKeepsScopesAndWorkspacesSeparate() throws Exception {
        JSONObject a = provider("workspace-a", "laptop", now, 20), b = provider("workspace-b", "laptop", now, 80);
        record(a, b);
        a = provider("workspace-a", "laptop", now + 60000, 24); record(a);
        assertNotEquals(a.getString("androidHistoryKey"), b.getString("androidHistoryKey"));
        store.close(); store = new LimitsHistoryStore(context, "hub-a");
        assertEquals(4, today(a, now + 60000).getDouble("value"), 0);
        assertTrue(today(b, now + 60000).isNull("value"));
        try (LimitsHistoryStore other = new LimitsHistoryStore(context, "hub-b")) {
            JSONObject copy = provider("workspace-a", "laptop", now + 60000, 24);
            other.record(new JSONObject().put("limits", new JSONObject().put("providers", new JSONArray().put(copy))), now + 60000);
            assertNotEquals(a.getString("androidHistoryKey"), copy.getString("androidHistoryKey"));
            assertTrue(other.query(copy, now + 60000).getJSONArray("windows").getJSONObject(0).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13).isNull("value"));
        }
        try (android.database.Cursor cursor = store.getReadableDatabase().rawQuery("SELECT id,account,source FROM streams", null)) {
            while (cursor.moveToNext()) for (int i = 0; i < 3; i++) assertTrue(cursor.getString(i).matches("[a-f0-9]{64}"));
        }
    }

    @Test public void consistentDevicesContinueOneTimelineAndInactiveFailuresDoNotCutIt() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20); record(p);
        p = provider("workspace-a", "server", now + 60000, 24); record(p);
        assertEquals(4, today(p, now + 60000).getDouble("value"), 0);
        record(provider("workspace-a", "laptop", now + 70000, 24).put("status", "unauthorized"));
        p = provider("workspace-a", "server", now + 120000, 28); record(p);
        assertEquals(8, today(p, now + 120000).getDouble("value"), 0);
        assertFalse(today(p, now + 120000).getBoolean("uncertain"));
    }

    @Test public void sourceConflictsWhileCurrentAreIgnoredUntilOwnerFallsSilent() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20); record(p);
        record(provider("workspace-a", "server", now + 60000, 5));
        p = provider("workspace-a", "laptop", now + 120000, 24); record(p);
        assertEquals(4, today(p, now + 120000).getDouble("value"), 0);
        assertFalse(today(p, now + 120000).getBoolean("uncertain"));
        // Once the current owner goes silent past the 2.5x polling window, a contradictory peer starts an uncertain baseline.
        p = provider("workspace-a", "server", now + 1000000, 10); record(p);
        assertTrue(today(p, now + 1000000).getBoolean("uncertain"));
        assertEquals(4, today(p, now + 1000000).getDouble("value"), 0);
        record(provider("workspace-a", "server", now + 1060000, 24).put("windows", new JSONArray()));
        p = provider("workspace-a", "server", now + 1120000, 30); record(p);
        assertTrue(entry(p, now + 1120000).getJSONArray("points").length() >= 4);
    }

    @Test public void failuresAndSamplingGapsKeepSameDayNetChangesButNotFabricatedCrossDayUsage() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20); record(p);
        record(provider("workspace-a", "laptop", now + 60000, 20).put("status", "unauthorized"));
        p = provider("workspace-a", "laptop", now + 120000, 24); record(p);
        assertEquals(4, today(p, now + 120000).getDouble("value"), 0);
        assertTrue(today(p, now + 120000).getBoolean("uncertain"));
        // Use a wallet without a reset deadline for a cross-day observation.
        JSONObject wallet = provider("wallet", "laptop", now, 0);
        JSONObject win = new JSONObject().put("kind", "credits").put("metric", "credits").put("currency", "USD").put("remaining", 10).put("showMeter", false);
        wallet.put("windows", new JSONArray().put(win)); record(wallet);
        wallet.put("updatedAt", java.time.Instant.ofEpochMilli(now + 86400000).toString()); win.put("remaining", 8); record(wallet);
        JSONObject summary = entry(wallet, now + 86400000).getJSONObject("distribution");
        assertTrue(summary.getJSONArray("buckets").getJSONObject(13).isNull("value"));
        assertEquals(2, summary.getDouble("unallocated"), 0);
    }

    @Test public void allowanceChangesAndResetsNeverBecomeOrdinaryUsage() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20); record(p);
        p = provider("workspace-a", "laptop", now + 60000, 24);
        p.getJSONArray("windows").getJSONObject(0).put("limit", 200); record(p);
        assertTrue(today(p, now + 60000).isNull("value"));
        p = provider("workspace-a", "laptop", now + 120000, 4); record(p);
        assertTrue(today(p, now + 120000).isNull("value"));
    }

    @Test public void measuredZeroIsDifferentFromNoIntervalAndOldDetailKeepsDailySummaries() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20); record(p);
        p = provider("workspace-a", "laptop", now + 60000, 20); record(p);
        assertEquals(0, today(p, now + 60000).getDouble("value"), 0);
        assertEquals(2, entry(p, now + 60000).getJSONArray("points").length());
        store.record(new JSONObject(), now + 200L * 86400000);
        assertEquals(1, android.database.DatabaseUtils.longForQuery(store.getReadableDatabase(), "SELECT COUNT(*) FROM daily", null));
    }

    @Test public void stableWindowIdsSurviveLabelChangesAndWalletsRetainTheirUnits() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 20);
        p.getJSONArray("windows").getJSONObject(0).put("limitId", "five-hour"); record(p);
        p = provider("workspace-a", "laptop", now + 60000, 24);
        p.getJSONArray("windows").getJSONObject(0).put("limitId", "five-hour").put("label", "Renamed"); record(p);
        assertEquals(4, today(p, now + 60000).getDouble("value"), 0);
        JSONObject credits = new JSONObject().put("metric", "credits").put("remaining", 8).put("currency", "CREDITS").put("showMeter", false);
        assertEquals("CREDITS", LimitsHistoryStore.readings(credits).get(0).unit);
        assertTrue(LimitsHistoryStore.readings(credits).get(0).balance);
    }

    @Test public void subPointJitterAndLateDeadlinesAreIgnored() throws Exception {
        JSONObject p = provider("workspace-a", "laptop", now, 2.04); record(p);
        record(provider("workspace-a", "laptop", now + 60000, 1.08));
        p = provider("workspace-a", "laptop", now + 120000, 3.04); record(p);
        assertEquals(1.0, today(p, now + 120000).getDouble("value"), 1e-6);
        assertEquals(0, entry(p, now + 120000).getJSONObject("distribution").getInt("resets"));

        long oldReset = now + 4 * 3600000;
        long newReset = now + 5 * 3600000;
        JSONObject next = provider("workspace-a", "server", now + 180000, 0);
        next.getJSONArray("windows").getJSONObject(0).put("resetsAt", java.time.Instant.ofEpochMilli(newReset).toString());
        record(next);
        JSONObject stale = provider("workspace-a", "laptop", now + 185000, 90);
        stale.getJSONArray("windows").getJSONObject(0).put("resetsAt", java.time.Instant.ofEpochMilli(oldReset).toString());
        record(stale);
        JSONArray pts = entry(next, now + 185000).getJSONArray("points");
        assertEquals(0.0, pts.getJSONObject(pts.length() - 1).getDouble("value"), 1e-6);
    }

    @Test public void rotatedCredentialAdoptsAliasHistoryWhileOpenCodeAliasesStaySeparate() throws Exception {
        JSONObject cookieQoder = provider("sha256:cookie-qoder", "pc", now, 20).put("provider", "qoder");
        cookieQoder.put("windows", new JSONArray().put(new JSONObject()
                .put("kind", "billing").put("label", "Team credits").put("usedPercent", 20)));
        record(cookieQoder);
        cookieQoder.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        cookieQoder.getJSONArray("windows").getJSONObject(0).put("usedPercent", 25);
        record(cookieQoder);

        JSONObject userQoder = new JSONObject(cookieQoder.toString())
                .put("accountKey", "sha256:user-qoder")
                .put("accountKeyAliases", new JSONArray().put("sha256:cookie-qoder"));
        userQoder.put("updatedAt", java.time.Instant.ofEpochMilli(now + 120000).toString());
        userQoder.getJSONArray("windows").getJSONObject(0).put("usedPercent", 30);
        record(userQoder);

        assertEquals(10.0, today(userQoder, now + 120000).getDouble("value"), 0);
        assertEquals(3, entry(userQoder, now + 120000).getJSONArray("points").length());
        assertEquals(1L, android.database.DatabaseUtils.longForQuery(
                store.getReadableDatabase(), "SELECT COUNT(*) FROM adoptions", null));

        // OpenCode aliases represent distinct live devices and must not be adopted into one stream.
        JSONObject ocApi = provider("sha256:oc-api", "pc", now, 10).put("provider", "opencode").put("source", "api");
        record(ocApi);
        JSONObject ocWeb = new JSONObject(ocApi.toString()).put("source", "web")
                .put("accountKey", "sha256:oc-workspace")
                .put("accountKeyAliases", new JSONArray().put("sha256:oc-api"));
        ocWeb.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        ocWeb.getJSONArray("windows").getJSONObject(0).put("usedPercent", 15);
        record(ocWeb);
        assertEquals(1, entry(ocWeb, now + 60000).getJSONArray("points").length());
        assertEquals(1, entry(ocApi, now + 60000).getJSONArray("points").length());
    }

    @Test public void upgradingV1DatabasePreservesHistoryAndEnablesAdoptions() throws Exception {
        store.close();
        context.deleteDatabase(LimitsHistoryStore.DATABASE);
        android.database.sqlite.SQLiteOpenHelper v1 = new android.database.sqlite.SQLiteOpenHelper(
                context, LimitsHistoryStore.DATABASE, null, 1) {
            @Override public void onCreate(android.database.sqlite.SQLiteDatabase db) {
                db.execSQL("CREATE TABLE streams(id TEXT PRIMARY KEY, account TEXT NOT NULL, source TEXT NOT NULL, guarded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0)");
                db.execSQL("CREATE INDEX streams_account ON streams(account)");
                db.execSQL("CREATE TABLE runs(id INTEGER PRIMARY KEY, stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, balance INTEGER NOT NULL, reset_at INTEGER, basis TEXT NOT NULL, interval_ms INTEGER NOT NULL, break_after INTEGER NOT NULL DEFAULT 0, uncertain_before INTEGER NOT NULL DEFAULT 0, uncertain_until INTEGER)");
                db.execSQL("CREATE INDEX runs_stream_end ON runs(stream,end_at)");
                db.execSQL("CREATE TABLE origins(stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, source TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(stream,source))");
                db.execSQL("CREATE TABLE daily(stream TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, day TEXT NOT NULL, value REAL, observations INTEGER NOT NULL DEFAULT 0, uncertain INTEGER NOT NULL DEFAULT 0, unallocated REAL NOT NULL DEFAULT 0, resets INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(stream,day))");
                db.execSQL("CREATE TABLE maintenance(day TEXT PRIMARY KEY)");
            }
            @Override public void onUpgrade(android.database.sqlite.SQLiteDatabase db, int o, int n) { }
        };
        v1.getWritableDatabase().close();
        v1.close();

        store = new LimitsHistoryStore(context, "hub-a");
        JSONObject p = provider("workspace-v1", "laptop", now, 10);
        record(p);
        p = provider("workspace-v1", "laptop", now + 60000, 14);
        record(p);
        assertEquals(4.0, today(p, now + 60000).getDouble("value"), 0);
        assertEquals(2, store.getReadableDatabase().getVersion());
    }

    @Test public void qoderDefaultSlotIsolatesByDeviceAndNotionPoolsRecordIndependently() throws Exception {
        String provisionalKey = "sha256:c325fbf2f2b9a182e7edbdf6f2163efde2b6b8c460a7c93bcc607c8cf31a5b52";
        JSONObject qoderA = provider(provisionalKey, "pc-a", now, 20)
                .put("provider", "qoder").put("region", "global").put("source", "web");
        JSONObject qoderB = provider(provisionalKey, "pc-b", now, 65)
                .put("provider", "qoder").put("region", "global").put("source", "web");
        record(qoderA, qoderB);
        qoderA.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        qoderA.getJSONArray("windows").getJSONObject(0).put("usedPercent", 28);
        qoderB.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        qoderB.getJSONArray("windows").getJSONObject(0).put("usedPercent", 70);
        record(qoderA, qoderB);

        assertEquals(8.0, today(qoderA, now + 60000).getDouble("value"), 0);
        assertEquals(5.0, today(qoderB, now + 60000).getDouble("value"), 0);

        JSONObject notion = new JSONObject()
                .put("provider", "notion")
                .put("accountKey", "sha256:notion-ws")
                .put("source", "web")
                .put("sourceDeviceId", "pc-a")
                .put("status", "ok")
                .put("updatedAt", java.time.Instant.ofEpochMilli(now).toString())
                .put("windows", new JSONArray()
                        .put(new JSONObject().put("kind", "billing").put("label", "Standard").put("used", 1000).put("limit", 4000).put("usedPercent", 25))
                        .put(new JSONObject().put("kind", "billing").put("label", "Select").put("used", 500).put("limit", 2000).put("usedPercent", 25)));
        record(notion);
        notion.put("updatedAt", java.time.Instant.ofEpochMilli(now + 60000).toString());
        notion.getJSONArray("windows").getJSONObject(0).put("used", 1400).put("usedPercent", 35);
        notion.getJSONArray("windows").getJSONObject(1).put("used", 800).put("usedPercent", 40);
        record(notion);

        JSONArray notionWindows = store.query(notion, now + 60000).getJSONArray("windows");
        assertEquals(2, notionWindows.length());
        assertEquals("Standard", notionWindows.getJSONObject(0).getJSONObject("window").getString("label"));
        assertEquals(10.0, notionWindows.getJSONObject(0).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13).getDouble("value"), 0);
        assertEquals("Select", notionWindows.getJSONObject(1).getJSONObject("window").getString("label"));
        assertEquals(15.0, notionWindows.getJSONObject(1).getJSONObject("distribution").getJSONArray("buckets").getJSONObject(13).getDouble("value"), 0);
    }
}
