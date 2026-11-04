package com.tokenmonitor.android;

import android.content.Context;
import android.content.res.Configuration;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class UsageWidgetTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private static JSONObject stats() throws Exception {
        JSONObject today = new JSONObject().put("totalTokens", 2_840_000).put("costUsd", 12.46)
                .put("cacheReadTokens", 2_340_160).put("unpricedTokens", 0)
                .put("capabilities", new JSONObject().put("tokenComponents", true))
                .put("sessions", new JSONObject().put("private", new JSONObject().put("title", "Never persist this")));
        return new JSONObject().put("periods", new JSONObject().put("today", today))
                .put("devices", new JSONArray().put(new JSONObject().put("stale", false))
                        .put(new JSONObject().put("stale", false)).put(new JSONObject().put("stale", true)));
    }

    @After public void clear() { new ConnectionStore(context).clear(); }

    @Test public void projectionPreservesUnknownReadingsAndOnlyStoresBoundedSummary() throws Exception {
        JSONObject source = stats();
        JSONObject summary = UsageWidgetSnapshot.project(source, 1234, 1200);
        assertEquals("2.8M", summary.getString("tokens"));
        assertEquals("$12.46", summary.getString("cost"));
        assertEquals("82.4%", summary.getString("cache"));
        assertEquals("2 / 3", summary.getString("devices"));
        assertFalse(summary.toString().contains("Never persist this"));
        JSONObject today = source.getJSONObject("periods").getJSONObject("today");
        today.remove("capabilities");
        today.put("costUsd", JSONObject.NULL);
        summary = UsageWidgetSnapshot.project(source, 1234, 1200);
        assertEquals("—", summary.getString("cost"));
        assertEquals("—", summary.getString("cache"));
        today.put("costUsd", 0).put("unpricedTokens", 1);
        summary = UsageWidgetSnapshot.project(source, 1234, 1200);
        assertEquals("$0.00", summary.getString("cost"));
        assertTrue(summary.getBoolean("partialCost"));
        assertEquals("1M", UsageWidgetSnapshot.compact(999_999));
        assertEquals("1B", UsageWidgetSnapshot.compact(999_999_999));
        today.put("totalTokens", "invalid");
        try {
            UsageWidgetSnapshot.project(source, 1234, 1200);
            fail("Invalid stats must not replace the previous snapshot");
        } catch (IllegalArgumentException expected) { /* retain last good data */ }
    }

    @Test public void lateResultsCannotCrossReconnectOrOverwriteNewerReads() throws Exception {
        ConnectionStore store = new ConnectionStore(context);
        ConnectionSpec spec = new ConnectionSpec("https://widget.example.com", "private-secret", false);
        store.save(spec);
        String first = store.binding();
        assertTrue(UsageWidgetStore.publish(context, first, stats(), 200, 100));
        UsageWidgetStore.failed(context, first, 50, true);
        assertFalse(UsageWidgetStore.read(context).optBoolean("failed"));
        assertFalse(UsageWidgetStore.publish(context, first, stats(), 300, 50));
        UsageWidgetStore.failed(context, first, 250, false);
        assertEquals(200, UsageWidgetStore.read(context).getLong("fetchedAt"));
        assertTrue(UsageWidgetStore.read(context).getBoolean("failed"));
        assertEquals(250, UsageWidgetStore.read(context).getLong("startedAt"));
        UsageWidgetStore.failed(context, first, 300, true);
        UsageWidgetStore.failed(context, first, 275, false);
        assertFalse("An older success must not clear a newer authentication failure",
                UsageWidgetStore.publish(context, first, stats(), 400, 200));
        assertTrue(UsageWidgetStore.read(context).getBoolean("authentication"));
        assertEquals(200, UsageWidgetStore.read(context).getLong("fetchedAt"));
        assertTrue(UsageWidgetStore.publish(context, first, stats(), 450, 350));
        assertFalse(UsageWidgetStore.read(context).optBoolean("failed"));
        assertFalse(UsageWidgetStore.read(context).optBoolean("authentication"));
        store.save(spec);
        assertNotEquals(first, store.binding());
        assertEquals(0, UsageWidgetStore.read(context).length());
        assertFalse(UsageWidgetStore.publish(context, first, stats(), 400, 350));
        UsageWidgetStore.failed(context, first, 500, true);
        assertEquals(0, UsageWidgetStore.read(context).length());
        assertTrue(UsageWidgetStore.publish(context, store.binding(), stats(), 600, 550));
        store.clear();
        assertEquals(0, UsageWidgetStore.read(context).length());
        assertFalse(UsageWidgetStore.publish(context, first, stats(), 700, 650));
    }

    @Test public void failedFirstReadRejectsAnOlderSuccessWithoutInventingData() throws Exception {
        ConnectionStore store = new ConnectionStore(context);
        store.save(new ConnectionSpec("https://widget.example.com", "test-secret", false));
        String binding = store.binding();
        UsageWidgetStore.failed(context, binding, 300, true);
        assertEquals(0, UsageWidgetStore.read(context).optLong("fetchedAt"));
        assertFalse(UsageWidgetStore.publish(context, binding, stats(), 400, 200));
        assertTrue(UsageWidgetStore.read(context).optBoolean("authentication"));
        assertTrue(UsageWidgetStore.publish(context, binding, stats(), 500, 450));
    }

    @Test public void sparseCalendarHistoryUsesLocalSnapshotDateAndDoesNotDoubleCountDays() throws Exception {
        JSONObject source = stats().put("historyPreview", new JSONObject().put("daily", new JSONArray()
                .put(new JSONObject().put("date", "2026-10-01").put("tokens", 100))
                .put(new JSONObject().put("date", "2026-10-15").put("tokens", 200))
                .put(new JSONObject().put("date", "2026-11-02").put("tokens", 10))
                .put(new JSONObject().put("date", "2026-11-04").put("tokens", 5))
                .put(new JSONObject().put("date", "2026-11-04").put("tokens", 4))
                .put(new JSONObject().put("date", "2026-11-05").put("tokens", 900))
                .put(new JSONObject().put("date", "2026-11-31").put("tokens", 1000))));
        long fetchedAt = java.time.LocalDate.of(2026, 11, 4).atStartOfDay(java.time.ZoneId.systemDefault())
                .plusMinutes(5).toInstant().toEpochMilli();
        JSONObject summary = UsageWidgetSnapshot.project(source, fetchedAt, fetchedAt - 100);
        assertEquals("15", summary.getString("sevenDayTokens"));
        assertEquals("10", summary.getString("peakDayTokens"));
        assertEquals(2, summary.getInt("sevenDayDays"));
        ConnectionStore store = new ConnectionStore(context);
        store.save(new ConnectionSpec("https://widget.example.com", "test-secret", false));
        assertTrue(UsageWidgetStore.publish(context, store.binding(), source, fetchedAt, fetchedAt - 100));
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View card = UsageWidgetProvider.views(context, WidgetLayoutPolicy.Kind.PERIODS, 280, 250)
                    .apply(context, new FrameLayout(context));
            assertEquals("7日小计", ((TextView) card.findViewById(R.id.widget_seven_day_label)).getText().toString());
            assertTrue(card.findViewById(R.id.widget_seven_day_tokens).getContentDescription().toString().contains("2天读数"));
        });
        JSONObject legacy = UsageWidgetStore.read(context);
        legacy.remove("sevenDayDays");
        context.getSharedPreferences("usage-widget", 0).edit().putString("snapshot", legacy.toString()).commit();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View card = UsageWidgetProvider.views(context, WidgetLayoutPolicy.Kind.PERIODS, 280, 250)
                    .apply(context, new FrameLayout(context));
            assertEquals("—", ((TextView) card.findViewById(R.id.widget_seven_day_tokens)).getText().toString());
            assertEquals("—", ((TextView) card.findViewById(R.id.widget_peak_tokens)).getText().toString());
            assertEquals("2.8M", ((TextView) card.findViewById(R.id.widget_tokens)).getText().toString());
        });
    }

    @Test public void walletQuotaAlertsMatchBalanceDisplayAndRespectHiddenOrUnknownReadings() throws Exception {
        JSONObject window = new JSONObject().put("kind", "credits").put("metric", "credits").put("remaining", 0);
        JSONObject balance = new JSONObject().put("amount", 30).put("monthSpend", 10);
        JSONObject provider = new JSONObject().put("provider", "openrouter").put("status", "ok")
                .put("accountEmail", "never-persist@example.com").put("balance", balance)
                .put("windows", new JSONArray().put(window));
        JSONObject source = stats().put("limits", new JSONObject().put("providers", new JSONArray().put(provider)));
        JSONObject summary = UsageWidgetSnapshot.project(source, 5000, 4900);
        assertEquals(1, summary.getInt("quotaAlerts"));
        assertEquals(100, summary.getJSONArray("quotas").getJSONObject(0).getInt("percent"));
        assertFalse(summary.toString().contains("never-persist@example.com"));
        ConnectionStore store = new ConnectionStore(context);
        store.save(new ConnectionSpec("https://widget.example.com", "test-secret", false));
        UsageWidgetStore.publish(context, store.binding(), source, 5000, 4900);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View card = UsageWidgetProvider.views(context, WidgetLayoutPolicy.Kind.QUOTA, 150, 130)
                    .apply(context, new FrameLayout(context));
            assertEquals("1 项需关注", ((TextView) card.findViewById(R.id.widget_quota_headline)).getText().toString());
        });
        window.remove("remaining");
        summary = UsageWidgetSnapshot.project(source, 5000, 4900);
        assertEquals(25, summary.getJSONArray("quotas").getJSONObject(0).getInt("percent"));
        window.put("showMeter", false);
        assertEquals(0, UsageWidgetSnapshot.project(source, 5000, 4900).getJSONArray("quotas").length());
        window.remove("showMeter");
        balance.remove("amount");
        assertEquals(0, UsageWidgetSnapshot.project(source, 5000, 4900).getJSONArray("quotas").length());
        balance.put("amount", 0);
        assertEquals(1, UsageWidgetSnapshot.project(source, 5000, 4900).getInt("quotaAlerts"));
        window.put("metric", "spend").put("usedPercent", 100);
        assertEquals(0, UsageWidgetSnapshot.project(source, 5000, 4900).getJSONArray("quotas").length());
    }

    @Test public void nativeRemoteViewsInflateAtMinimumAndExpandedSizes() throws Exception {
        ConnectionStore store = new ConnectionStore(context);
        store.save(new ConnectionSpec("https://widget.example.com", "test-secret", false));
        UsageWidgetStore.publish(context, store.binding(), stats(), System.currentTimeMillis(), 1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (int[] size : new int[][] {{250, 180}, {320, 180}, {420, 240}}) {
                View card = UsageWidgetProvider.views(context).apply(context, new FrameLayout(context));
                float density = context.getResources().getDisplayMetrics().density;
                card.measure(View.MeasureSpec.makeMeasureSpec(Math.round(size[0] * density), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(Math.round(size[1] * density), View.MeasureSpec.EXACTLY));
                card.layout(0, 0, card.getMeasuredWidth(), card.getMeasuredHeight());
                TextView tokens = card.findViewById(R.id.widget_tokens);
                TextView footer = card.findViewById(R.id.widget_updated);
                assertEquals("2.8M", tokens.getText().toString());
                assertTrue(footer.getText().toString().contains("上次读取"));
                assertTrue("Footer must fit at " + size[0], footer.getBottom() <= card.getHeight() - card.getPaddingBottom());
                assertTrue("Primary total must remain visible", tokens.getHeight() > 0);
            }
            Configuration configuration = new Configuration(context.getResources().getConfiguration());
            configuration.fontScale = 1.3f;
            Context scaled = context.createConfigurationContext(configuration);
            View card = UsageWidgetProvider.views(scaled).apply(scaled, new FrameLayout(scaled));
            float density = scaled.getResources().getDisplayMetrics().density;
            card.measure(View.MeasureSpec.makeMeasureSpec(Math.round(320 * density), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(Math.round(240 * density), View.MeasureSpec.EXACTLY));
            card.layout(0, 0, card.getMeasuredWidth(), card.getMeasuredHeight());
            assertTrue(card.findViewById(R.id.widget_updated).getBottom() <= card.getHeight() - card.getPaddingBottom());
        });
    }

    @Test public void multiPeriodAndQuotaProjectionDropsSensitiveFieldsAndInflatesAllVarieties() throws Exception {
        JSONObject source = stats();
        JSONObject today = source.getJSONObject("periods").getJSONObject("today");
        today.put("inputTokens", 380_000).put("outputTokens", 120_000)
                .put("clients", new JSONObject()
                        .put("claude", 1_900_000)
                        .put("codex", 840_000)
                        .put("secret-corp-tool", 100_000));
        source.getJSONObject("periods")
                .put("month", new JSONObject().put("totalTokens", 48_200_000).put("costUsd", 164.20).put("unpricedTokens", 0))
                .put("allTime", new JSONObject().put("totalTokens", 215_000_000).put("costUsd", 912.50));
        source.put("devices", new JSONArray()
                .put(new JSONObject().put("deviceId", "dev-secret-99").put("hostname", "secret-macbook").put("stale", false))
                .put(new JSONObject().put("deviceId", "dev-2").put("hostname", "workstation").put("stale", true)));
        source.put("historyPreview", new JSONObject().put("daily", new JSONArray()
                .put(new JSONObject().put("date", "2026-11-01").put("tokens", 1_600_000))
                .put(new JSONObject().put("date", "2026-11-02").put("tokens", 3_400_000))
                .put(new JSONObject().put("date", "2026-11-03").put("tokens", 2_000_000))));
        source.put("limits", new JSONObject().put("providers", new JSONArray()
                .put(new JSONObject().put("provider", "claude").put("status", "ok").put("stale", false)
                        .put("accountEmail", "private@example.com").put("accountName", "Private Team")
                        .put("windows", new JSONArray().put(new JSONObject()
                                .put("kind", "session").put("usedPercent", 88.0).put("resetLabel", "secret-reset-note"))))
                .put(new JSONObject().put("provider", "codex").put("status", "ok").put("stale", false)
                        .put("windows", new JSONArray().put(new JSONObject()
                                .put("kind", "weekly").put("remainingPercent", 38.0))))));

        long fetchedAt = java.time.LocalDate.of(2026, 11, 4).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        JSONObject summary = UsageWidgetSnapshot.project(source, fetchedAt, fetchedAt - 100);
        String raw = summary.toString();
        assertFalse(raw.contains("secret-macbook"));
        assertFalse(raw.contains("dev-secret-99"));
        assertFalse(raw.contains("private@example.com"));
        assertFalse(raw.contains("Private Team"));
        assertFalse(raw.contains("secret-reset-note"));
        assertFalse(raw.contains("secret-corp-tool"));

        assertEquals("48.2M", summary.getString("monthTokens"));
        assertEquals("$164.20", summary.getString("monthCost"));
        assertEquals("215M", summary.getString("allTimeTokens"));
        assertEquals("$912.50", summary.getString("allTimeCost"));
        assertEquals("380K", summary.getString("inputTokens"));
        assertEquals("120K", summary.getString("outputTokens"));
        assertEquals("7M", summary.getString("sevenDayTokens"));
        assertEquals("3.4M", summary.getString("peakDayTokens"));
        assertEquals(2, summary.getInt("quotaAccounts"));
        assertEquals(2, summary.getInt("quotaHealthy"));
        assertEquals(1, summary.getInt("quotaAlerts"));
        assertEquals("Claude · 会话", summary.getJSONArray("quotas").getJSONObject(0).getString("label"));
        assertTrue(summary.getJSONArray("quotas").getJSONObject(0).getBoolean("warn"));

        ConnectionStore store = new ConnectionStore(context);
        store.save(new ConnectionSpec("https://widget.example.com", "test-secret", false));
        assertTrue(UsageWidgetStore.publish(context, store.binding(), source, fetchedAt, 10));

        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            float density = context.getResources().getDisplayMetrics().density;
            Object[][] cases = new Object[][] {
                    {WidgetLayoutPolicy.Kind.COMPACT, 115, 60, R.id.widget_tokens, "2.8M"},
                    {WidgetLayoutPolicy.Kind.COMPACT, 150, 130, R.id.widget_month_tokens, "48.2M"},
                    {WidgetLayoutPolicy.Kind.TODAY, 150, 130, R.id.widget_tokens, "2.8M"},
                    {WidgetLayoutPolicy.Kind.TODAY, 280, 260, R.id.widget_tools_summary, "Claude 1.9M"},
                    {WidgetLayoutPolicy.Kind.PERIODS, 260, 160, R.id.widget_all_tokens, "215M"},
                    {WidgetLayoutPolicy.Kind.PERIODS, 280, 250, R.id.widget_seven_day_tokens, "7M"},
                    {WidgetLayoutPolicy.Kind.QUOTA, 150, 130, R.id.widget_quota_headline, "1 项需关注"},
                    {WidgetLayoutPolicy.Kind.QUOTA, 260, 175, R.id.widget_quota_1_label, "Claude · 会话"},
                    {WidgetLayoutPolicy.Kind.QUOTA, 280, 250, R.id.widget_quota_1_label, "Claude · 会话"}
            };
            for (Object[] c : cases) {
                WidgetLayoutPolicy.Kind kind = (WidgetLayoutPolicy.Kind) c[0];
                int w = (Integer) c[1];
                int h = (Integer) c[2];
                int viewId = (Integer) c[3];
                String expected = (String) c[4];
                View card = UsageWidgetProvider.views(context, kind, w, h).apply(context, new FrameLayout(context));
                card.measure(View.MeasureSpec.makeMeasureSpec(Math.round(w * density), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(Math.round(h * density), View.MeasureSpec.EXACTLY));
                card.layout(0, 0, card.getMeasuredWidth(), card.getMeasuredHeight());
                TextView target = card.findViewById(viewId);
                assertNotNull("Expected view in " + kind + " " + w + "x" + h, target);
                assertTrue("Unexpected text in " + kind + ": " + target.getText(), target.getText().toString().contains(expected));
                TextView footer = card.findViewById(R.id.widget_updated);
                if (footer != null) {
                    assertTrue("Footer clipped in " + kind + " " + w + "x" + h,
                            footer.getBottom() <= card.getHeight() - card.getPaddingBottom());
                }
            }
        });
    }
}
