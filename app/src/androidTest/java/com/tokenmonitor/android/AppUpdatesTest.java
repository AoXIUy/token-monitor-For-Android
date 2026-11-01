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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class AppUpdatesTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private AppUpdates updates;

    @Before public void reset() { context.getSharedPreferences("app-updates", 0).edit().clear().commit(); }
    @After public void close() {
        onMain(() -> { if (updates != null) updates.close(); });
        context.getSharedPreferences("app-updates", 0).edit().clear().putBoolean("automatic", false).commit();
    }
    private static void onMain(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private static void await(BooleanSupplier condition) throws Exception {
        long end = System.currentTimeMillis() + 5000;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < end) Thread.sleep(20);
        assertTrue("Updater did not reach the expected state", condition.getAsBoolean());
    }
    private static JSONObject release(String version) throws Exception {
        return new JSONObject().put("tag_name", "v" + version).put("draft", false).put("prerelease", false)
                .put("name", "Release " + version).put("body", "Updates").put("html_url", AppUpdatePolicy.releaseUrl(version))
                .put("assets", new JSONArray().put(new JSONObject().put("name", AppUpdatePolicy.apkName(version))
                        .put("state", "uploaded").put("size", 123456).put("browser_download_url", AppUpdatePolicy.apkUrl(version))));
    }
    private static void rejects(JSONObject data) throws Exception {
        try { GitHubRelease.parse(data); fail("Accepted an invalid release"); }
        catch (IllegalArgumentException | org.json.JSONException expected) { }
    }

    @Test public void onlyPublishedStableRepositoryApksAreAccepted() throws Exception {
        assertEquals("1.10.0", GitHubRelease.parse(release("1.10.0")).version);
        rejects(release("1.10.0").put("draft", true));
        rejects(release("1.10.0").put("prerelease", true));
        rejects(release("1.10.0").put("tag_name", "v1.10.0-beta"));
        rejects(release("1.10.0").put("html_url", "https://github.com/another/repo/releases/tag/v1.10.0"));
        for (String url : new String[] { "https://evil.test/app.apk", AppUpdatePolicy.apkUrl("1.10.0") + "?redirect=evil",
                AppUpdatePolicy.apkUrl("1.10.0").replace("https:", "http:") }) {
            JSONObject data = release("1.10.0");
            data.getJSONArray("assets").getJSONObject(0).put("browser_download_url", url);
            rejects(data);
        }
        JSONObject data = release("1.10.0");
        data.getJSONArray("assets").getJSONObject(0).put("state", "new");
        rejects(data);
        rejects(release("1.10.0").put("assets", new JSONArray()));
        assertEquals("1.10.0", GitHubRelease.parse(GitHubRelease.parse(release("1.10.0")).cache()).version);
    }

    @Test public void checksAreCoalescedThrottledAndCachedWhileManualChecksBypassAutomaticOptOut() throws Exception {
        AtomicLong clock = new AtomicLong(1000000);
        AtomicInteger calls = new AtomicInteger();
        AtomicBoolean failRequest = new AtomicBoolean();
        AtomicReference<JSONObject> state = new AtomicReference<>();
        CountDownLatch gate = new CountDownLatch(1);
        onMain(() -> {
            updates = new AppUpdates(context, "1.0.8", () -> {
                calls.incrementAndGet();
                return new AppUpdates.Call() {
                    public JSONObject get() throws Exception {
                        assertTrue(gate.await(5, TimeUnit.SECONDS));
                        if (failRequest.get()) throw new java.io.IOException("Offline");
                        return release("1.10.0");
                    }
                    public void cancel() { gate.countDown(); }
                };
            }, clock::get, state::set);
            updates.resume();
            updates.check(true);
        });
        assertEquals(1, calls.get());
        gate.countDown();
        await(() -> state.get() != null && state.get().optBoolean("available") && !state.get().optBoolean("checking"));
        onMain(() -> { updates.resume(); updates.automatic(false); updates.resume(); });
        assertEquals(1, calls.get());
        onMain(() -> updates.check(true));
        assertEquals(2, calls.get());
        await(() -> !state.get().optBoolean("checking"));
        failRequest.set(true);
        onMain(() -> updates.check(true));
        await(() -> !state.get().optBoolean("checking") && !state.get().optString("error").isEmpty());
        assertTrue("Failed checks must retain a previously validated update", state.get().getBoolean("available"));
        assertEquals(1000000, state.get().getLong("checkedAt"));
        onMain(() -> {
            updates.close();
            updates = new AppUpdates(context, "1.0.8", () -> { throw new AssertionError("Disabled auto-check must not access the network"); }, clock::get, state::set);
            updates.resume();
        });
        assertTrue(state.get().getBoolean("available"));
        assertFalse(state.get().getBoolean("automatic"));
        assertEquals(AppUpdatePolicy.apkUrl("1.10.0"), updates.downloadUrl());
    }

    @Test public void stoppedRequestsAreCancelledAndCannotPublishLateResults() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicBoolean cancelled = new AtomicBoolean();
        AtomicBoolean stalePublished = new AtomicBoolean();
        AtomicReference<JSONObject> state = new AtomicReference<>();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch releaseOld = new CountDownLatch(1);
        onMain(() -> {
            updates = new AppUpdates(context, "1.0.8", () -> {
                int index = calls.incrementAndGet();
                return new AppUpdates.Call() {
                    public JSONObject get() throws Exception {
                        if (index == 1) { entered.countDown(); assertTrue(releaseOld.await(5, TimeUnit.SECONDS)); }
                        return release(index == 1 ? "9.0.0" : "2.0.0");
                    }
                    public void cancel() { cancelled.set(true); }
                };
            }, () -> 1000000, value -> {
                if ("9.0.0".equals(value.optString("latestVersion"))) stalePublished.set(true);
                state.set(value);
            });
            updates.resume();
        });
        assertTrue(entered.await(5, TimeUnit.SECONDS));
        onMain(() -> { updates.pause(); updates.resume(); });
        releaseOld.countDown();
        await(() -> state.get() != null && "2.0.0".equals(state.get().optString("latestVersion")));
        assertTrue(cancelled.get());
        assertFalse(stalePublished.get());
        assertEquals(2, calls.get());
    }
}
