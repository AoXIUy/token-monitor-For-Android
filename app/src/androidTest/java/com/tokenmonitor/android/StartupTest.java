package com.tokenmonitor.android;

import android.content.Intent;
import android.graphics.Insets;
import android.graphics.Rect;
import android.os.Build;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.filters.SdkSuppress;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Runs against Android's actual WebView and native bridge on a test emulator. */
@RunWith(AndroidJUnit4.class)
public final class StartupTest {
    private static final long WEBVIEW_TIMEOUT_MS = 20_000;
    private ActivityScenario<MainActivity> scenario;

    @Before public void launchFreshViewer() {
        SessionMonitorService.stop(InstrumentationRegistry.getInstrumentation().getTargetContext(), "测试重置", true);
        clearConnection();
        InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("app-updates", 0)
                .edit().clear().putBoolean("automatic", false).commit();
        scenario = ActivityScenario.launch(MainActivity.class);
    }

    @After public void closeViewer() {
        SessionMonitorService.stop(InstrumentationRegistry.getInstrumentation().getTargetContext(), "测试结束", true);
        try {
            if (scenario != null) scenario.close();
        } finally {
            clearConnection();
        }
    }

    private void clearConnection() {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences("hub-connection", 0).edit().clear().commit();
        context.getSharedPreferences("limits-prefs", 0).edit().clear().commit();
        context.getSharedPreferences("display-prefs", 0).edit().clear().commit();
    }

    private static WebView web(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = web(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String evaluate(String script) throws Exception {
        return evaluate(script, WEBVIEW_TIMEOUT_MS);
    }

    private String evaluate(String script, long timeoutMs) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch callback = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            assertNotNull("Activity must contain its WebView", view);
            view.evaluateJavascript(script, value -> { result.set(value); callback.countDown(); });
        });
        assertTrue("WebView JS callback timed out", callback.await(timeoutMs, TimeUnit.MILLISECONDS));
        return result.get();
    }

    private void awaitScript(String expression) throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + WEBVIEW_TIMEOUT_MS;
        String last;
        do {
            // Page readiness owns one 20-second budget, including a cold renderer's callback.
            last = evaluate("Boolean(" + expression + ")",
                    Math.max(1, deadline - android.os.SystemClock.elapsedRealtime()));
            if ("true".equals(last)) return;
            Thread.sleep(100);
        } while (android.os.SystemClock.elapsedRealtime() < deadline);
        fail("WebView did not reach expected state: " + expression + "; result=" + last);
    }

    private void awaitConnectionPage() throws Exception {
        awaitScript("typeof window.receiveNative === 'function' && document.getElementById('settings') && !document.getElementById('settings').hidden");
    }

    @Test public void packagedPageLoadsCssScriptsAndNativeReadyCallback() throws Exception {
        awaitConnectionPage();
        assertEquals("true", evaluate("window.TokenMonitorClientCatalog.CLIENT_LABELS.gemini === 'Gemini CLI' && window.TokenMonitorClientCatalog.CLIENT_LABELS.mistral === 'Mistral Vibe'"));
        assertEquals("true", evaluate("location.href === '" + LocalContentClient.START_URL + "'"));
        assertEquals("true", evaluate("document.getElementById('page-title').textContent === '连接 Hub'"));
        assertEquals("true", evaluate("getComputedStyle(document.body).backgroundColor === 'rgb(9, 12, 16)'"));
        assertEquals("true", evaluate("typeof window.MonitorModel.quota === 'function' && typeof window.TokenMonitorLimitBalanceDisplay.creditsAmount === 'function' && typeof window.TokenMonitorSessionLive.sessionActivityState === 'function' && typeof window.TokenMonitorSessionGroups.sessionFamilies === 'function'"));
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            assertTrue(view.getSettings().getBlockNetworkLoads());
            assertFalse(view.getSettings().getAllowFileAccess());
            assertFalse(view.getSettings().getAllowContentAccess());
        });
    }

    @Test public void appUpdatesRenderSafeNotesAndRemainIndependentOfHubConnections() throws Exception {
        awaitConnectionPage();
        String installed = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageManager()
                .getPackageInfo("com.tokenmonitor.android", 0).versionName;
        awaitScript("document.getElementById('app-update').textContent.includes(" + org.json.JSONObject.quote("当前版本 " + installed) + ") && document.getElementById('check-app-update')");
        evaluate("window.receiveNative({type:'appUpdate',currentVersion:'1.0.8',latestVersion:'9.9.0',available:true,automatic:false,checkedAt:123,size:1048576,name:'New release',notes:'<img id=unsafe-update src=x onerror=alert(1)>'})");
        awaitScript("document.getElementById('app-update-banner') && document.getElementById('app-update-status').textContent.includes('9.9.0')");
        evaluate("document.querySelector('#app-update summary').click()");
        assertEquals("true", evaluate("document.getElementById('app-update').textContent.includes('<img id=unsafe-update') && !document.getElementById('unsafe-update')"));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        awaitScript("document.getElementById('app-update-banner')");
        evaluate("document.querySelector('#app-update-banner button').click()");
        awaitScript("document.getElementById('download-app-update').textContent.includes('9.9.0')");
        evaluate("document.querySelector('[aria-label=\"稍后更新\"]').click()");
        awaitScript("!document.getElementById('app-update-banner')");
        evaluate("window.receiveNative({type:'connection',url:''})");
        awaitScript("document.getElementById('download-app-update') && !document.getElementById('app-update-banner')");
    }

    @Test public void updateDialogHandlesDismissalProgressAndSystemInstallHandoff() throws Exception {
        awaitConnectionPage();
        evaluate("window.receiveNative({type:'appUpdate',currentVersion:'1.2.1',latestVersion:'9.0.0',available:true,promptToken:'offer-1',notes:'<b id=untrusted-update>Release notes</b>'})");
        awaitScript("document.querySelector('#app-update-dialog[open]') && document.getElementById('dialog-download-app-update')");
        assertEquals("true", evaluate("!document.getElementById('untrusted-update') && document.getElementById('app-update-dialog').textContent.includes('<b id=untrusted-update>')"));
        assertEquals("true", evaluate("window.handleBackNavigation()"));
        awaitScript("!document.querySelector('#app-update-dialog[open]')");
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        assertEquals("true", evaluate("!document.querySelector('#app-update-dialog[open]')"));
        evaluate("window.receiveNative({type:'appUpdate',currentVersion:'1.2.1',latestVersion:'9.0.0',available:true,promptToken:'offer-2'})");
        awaitScript("document.querySelector('#app-update-dialog[open]')");
        evaluate("window.receiveNative({type:'appUpdateDownload',phase:'downloading',version:'9.0.0',downloaded:50,total:100,message:'Downloading'})");
        awaitScript("document.querySelector('#app-update-dialog [role=progressbar]').getAttribute('aria-valuenow') === '50' && document.getElementById('dialog-cancel-app-update')");
        evaluate("window.receiveNative({type:'appUpdateDownload',phase:'permission',version:'9.0.0',downloaded:100,total:100})");
        awaitScript("document.getElementById('dialog-install-app-update').textContent.includes('授权并安装')");
        evaluate("window.receiveNative({type:'appUpdateDownload',phase:'installing',version:'9.0.0',downloaded:100,total:100})");
        awaitScript("!document.querySelector('#app-update-dialog[open]')");
    }

    @Test public void systemBarsAndKeyboardResizeTheWholeWebViewport() throws Exception {
        awaitConnectionPage();
        Rect bars = new Rect(0, 24, 0, 32);
        assertSafeViewport(bars, null, 0);
        assertSafeViewport(bars, null, 240);
        assertSafeViewport(bars, null, 0);
        assertSafeViewport(new Rect(), null, 0);
    }

    @SdkSuppress(minSdkVersion = 29)
    @Test public void cutoutInsetsFollowEachEdgeWithoutAccumulating() throws Exception {
        awaitConnectionPage();
        assertSafeViewport(new Rect(0, 24, 0, 32), new Rect(0, 80, 0, 0), 0);
        assertSafeViewport(new Rect(0, 24, 48, 0), new Rect(72, 0, 0, 0), 0);
        assertSafeViewport(new Rect(0, 24, 48, 0), new Rect(72, 0, 0, 0), 0);
        assertSafeViewport(new Rect(0, 24, 0, 32), new Rect(0, 0, 72, 64), 0);
        assertSafeViewport(new Rect(), null, 0);
    }

    @SuppressWarnings("deprecation")
    private void assertSafeViewport(Rect bars, Rect cutout, int keyboardBottom) throws Exception {
        Rect safe = new Rect(bars);
        if (cutout != null) {
            safe.left = Math.max(safe.left, cutout.left);
            safe.top = Math.max(safe.top, cutout.top);
            safe.right = Math.max(safe.right, cutout.right);
            safe.bottom = Math.max(safe.bottom, cutout.bottom);
        }
        safe.bottom = Math.max(safe.bottom, keyboardBottom);
        float[] expectedCssSize = new float[2];
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            ViewGroup host = (ViewGroup) view.getParent();
            AtomicReference<WindowInsets> delivered = new AtomicReference<>();
            view.setOnApplyWindowInsetsListener((target, remaining) -> {
                delivered.set(remaining);
                return target.onApplyWindowInsets(remaining);
            });
            Rect window = new Rect(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboardBottom));
            WindowInsets insets;
            if (Build.VERSION.SDK_INT >= 29) {
                WindowInsets.Builder builder = new WindowInsets.Builder()
                        .setSystemWindowInsets(Insets.of(window))
                        .setStableInsets(Insets.of(bars));
                if (cutout != null) builder.setDisplayCutout(new DisplayCutout(cutout, Collections.emptyList()));
                if (Build.VERSION.SDK_INT >= 30) {
                    builder.setInsets(WindowInsets.Type.systemBars(), Insets.of(bars))
                            .setVisible(WindowInsets.Type.systemBars(), true)
                            .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, keyboardBottom))
                            .setVisible(WindowInsets.Type.ime(), keyboardBottom > 0);
                }
                insets = builder.build();
            } else {
                insets = new WindowInsets(view.getRootWindowInsets())
                        .replaceSystemWindowInsets(window.left, window.top, window.right, window.bottom);
                if (Build.VERSION.SDK_INT >= 28) insets = insets.consumeDisplayCutout();
            }
            host.dispatchApplyWindowInsets(insets);
            // Complete native layout before checking the asynchronous web viewport.
            host.measure(View.MeasureSpec.makeMeasureSpec(host.getWidth(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(host.getHeight(), View.MeasureSpec.EXACTLY));
            host.layout(host.getLeft(), host.getTop(), host.getRight(), host.getBottom());
            assertEquals(safe.left, view.getLeft());
            assertEquals(safe.top, view.getTop());
            assertEquals(host.getWidth() - safe.right, view.getRight());
            assertEquals(host.getHeight() - safe.bottom, view.getBottom());
            assertEquals(0, view.getPaddingTop());
            assertEquals(0, view.getPaddingBottom());
            WindowInsets remaining = delivered.get();
            assertNotNull("Zeroed insets must still reach WebView on every update", remaining);
            assertEquals(0, remaining.getSystemWindowInsetLeft());
            assertEquals(0, remaining.getSystemWindowInsetTop());
            assertEquals(0, remaining.getSystemWindowInsetRight());
            assertEquals(0, remaining.getSystemWindowInsetBottom());
            if (Build.VERSION.SDK_INT >= 28) assertNull(remaining.getDisplayCutout());
            if (Build.VERSION.SDK_INT >= 30) {
                assertEquals(Insets.NONE, remaining.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime()));
            }
        });
        // Android can redispatch real window insets after the injected frame.
        // Compare the asynchronous CSS viewport with the latest native bounds.
        long deadline = System.currentTimeMillis() + 20000;
        String matches;
        do {
            scenario.onActivity(activity -> {
                WebView view = web(activity.getWindow().getDecorView());
                float density = view.getResources().getDisplayMetrics().density;
                expectedCssSize[0] = view.getWidth() / density;
                expectedCssSize[1] = view.getHeight() / density;
            });
            matches = evaluate("Math.abs(innerWidth - " + expectedCssSize[0] + ") <= 1 && Math.abs(innerHeight - " + expectedCssSize[1] + ") <= 1");
            if ("true".equals(matches)) break;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        assertEquals("CSS viewport must match native bounds " + expectedCssSize[0] + "x" + expectedCssSize[1]
                + "; actual=" + evaluate("JSON.stringify([innerWidth, innerHeight, devicePixelRatio])"), "true", matches);
        assertEquals("true", evaluate("(() => { const nav = document.querySelector('.bottom-nav').getBoundingClientRect();"
                + " return nav.left >= -1 && nav.right <= innerWidth + 1 && nav.top >= 0 && Math.abs(nav.bottom - innerHeight) <= 1; })()"));
    }

    private static WebResourceRequest request(String url) {
        return new WebResourceRequest() {
            @Override public Uri getUrl() { return Uri.parse(url); }
            @Override public boolean isForMainFrame() { return true; }
            @Override public boolean isRedirect() { return false; }
            @Override public boolean hasGesture() { return false; }
            @Override public String getMethod() { return "GET"; }
            @Override public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }

    @Test public void onlyPackagedAssetsAreAdmitted() throws Exception {
        LocalContentClient client = new LocalContentClient(InstrumentationRegistry.getInstrumentation().getTargetContext());
        WebResourceResponse main = client.shouldInterceptRequest(null, request(LocalContentClient.START_URL));
        // AssetLoader leaves the default response status unset (0) on Android.
        assertEquals("text/html", main.getMimeType());
        assertTrue(main.getData().read() >= 0);
        main.getData().close();
        WebResourceResponse groups = client.shouldInterceptRequest(null,
                request(LocalContentClient.ORIGIN + "/assets/shared/sessionGroups.js"));
        assertTrue("Shared session grouping must be packaged and allowlisted", groups.getData().read() >= 0);
        assertNotEquals(403, groups.getStatusCode());
        groups.getData().close();
        WebResourceResponse kinds = client.shouldInterceptRequest(null,
                request(LocalContentClient.ORIGIN + "/assets/shared/deviceKind.js"));
        assertTrue("Shared device kinds must be packaged and allowlisted", kinds.getData().read() >= 0);
        assertNotEquals(403, kinds.getStatusCode());
        kinds.getData().close();
        WebResourceResponse catalog = client.shouldInterceptRequest(null,
                request(LocalContentClient.ORIGIN + "/assets/shared/clientCatalog.js"));
        assertTrue("Client catalog must be packaged", catalog.getData().read() >= 0);
        assertNotEquals(403, catalog.getStatusCode());
        catalog.getData().close();
        for (String file : new String[]{"windowLabels.js", "windowText.js", "historyModel.js"}) {
            WebResourceResponse history = client.shouldInterceptRequest(null,
                    request(LocalContentClient.ORIGIN + "/assets/shared/limits/" + file));
            assertTrue("Quota history helpers must be packaged", history.getData().read() >= 0);
            assertNotEquals(403, history.getStatusCode());
            history.getData().close();
        }
        for (String url : new String[] {
                "https://example.com/", "data:text/html;base64,PGh0bWw+", "file:///etc/hosts",
                "http://appassets.androidplatform.net/assets/index.html",
                "https://appassets.androidplatform.net.evil.test/assets/index.html",
                LocalContentClient.ORIGIN + "/assets/../index.html",
                LocalContentClient.ORIGIN + "/assets/%69ndex.html",
                LocalContentClient.ORIGIN + "/assets/index.html?remote=1",
                LocalContentClient.ORIGIN + "/assets/missing.html"
        }) {
            assertEquals(url, 403, client.shouldInterceptRequest(null, request(url)).getStatusCode());
        }
    }

    @Test public void quotaHistoryShowsWorkspaceWindowsAndAccessibleDailyReadings() throws Exception {
        awaitConnectionPage();
        String key = String.join("", Collections.nCopies(64, "a"));
        long now = System.currentTimeMillis();
        org.json.JSONObject win = new org.json.JSONObject().put("kind", "session").put("label", "Session")
                .put("usedPercent", 24).put("windowMinutes", 300).put("resetsAt", java.time.Instant.ofEpochMilli(now + 3600000).toString());
        org.json.JSONObject provider = new org.json.JSONObject().put("provider", "opendesign").put("accountKey", "workspace-a")
                .put("accountName", "Design workspace").put("status", "ok").put("androidHistoryKey", key)
                .put("windows", new org.json.JSONArray().put(win));
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false)).put("limits",
                new org.json.JSONObject().put("providers", new org.json.JSONArray().put(provider)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelector('[data-limit-account]').textContent.includes('OpenDesign')");
        evaluate("document.querySelector('[data-quota-history-toggle]').click()");
        org.json.JSONArray buckets = new org.json.JSONArray();
        java.time.LocalDate today = java.time.Instant.ofEpochMilli(now).atZone(java.time.ZoneId.systemDefault()).toLocalDate();
        for (int i = 13; i >= 0; i--) buckets.put(new org.json.JSONObject().put("key", today.minusDays(i).toString())
                .put("value", i == 0 ? 4 : org.json.JSONObject.NULL).put("observations", i == 0 ? 2 : 0).put("uncertain", false));
        org.json.JSONObject history = new org.json.JSONObject().put("type", "quotaHistory").put("key", key).put("now", now).put("persistent", true)
                .put("windows", new org.json.JSONArray().put(new org.json.JSONObject().put("key", "five-hour").put("window", win).put("unit", "pp").put("balance", false)
                        .put("points", new org.json.JSONArray().put(new org.json.JSONObject().put("at", now - 60000).put("value", 20).put("unit", "pp").put("balance", false).put("reset", now + 3600000))
                                .put(new org.json.JSONObject().put("at", now).put("value", 24).put("unit", "pp").put("balance", false).put("reset", now + 3600000)))
                        .put("distribution", new org.json.JSONObject().put("buckets", buckets).put("unallocated", 0).put("resets", 0))));
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(history.toString()) + ")");
        awaitScript("document.querySelector('[data-quota-history] [aria-live]').textContent.includes('4%')");
        assertEquals("true", evaluate("document.querySelectorAll('[aria-label=\"近14天额度净变化\"] button').length === 14 && document.querySelector('[data-quota-history] svg').getAttribute('aria-label').includes('不是预测')"));
        evaluate("document.querySelector('[aria-label=\"近14天额度净变化\"] button').click()");
        awaitScript("document.querySelector('[data-quota-history] [aria-live]').textContent.includes('数据不足')");
        publishStats(stats);
        assertEquals("true", evaluate("document.querySelector('[data-quota-history-toggle]').getAttribute('aria-expanded') === 'true'"));
        evaluate("window.receiveNative({type:'connection',url:'https://other.example.com'})");
        awaitScript("!document.querySelector('[data-quota-history]')");
    }

    @Test public void latestModelRendersApartFromHistoricalModelUsage() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(true));
        org.json.JSONObject row = stats.getJSONObject("periods").getJSONObject("today").getJSONObject("sessions").getJSONObject("codex:test");
        row.put("latestModel", "newer").put("models", new org.json.JSONObject().put("older", 90).put("newer", 10));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-session-model]').textContent === 'newer +1'");
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelector('[data-session-detail]')");
        evaluate("document.querySelector('[data-session-detail]').click()");
        awaitScript("document.getElementById('page-title').textContent === '会话详情'");
        assertEquals("true", evaluate("Array.from(document.querySelectorAll('dt')).find(x => x.textContent === '最近使用模型').nextElementSibling.textContent === 'newer' && document.body.innerText.includes('older')"));
        row.put("latestModel", org.json.JSONObject.NULL); publishStats(stats);
        awaitScript("Array.from(document.querySelectorAll('dt')).find(x => x.textContent === '最近使用模型').nextElementSibling.textContent === '未知'");
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-session-model]').textContent === '2 个模型'");
    }

    @Test public void harkAndQoderRenderIndependentCountsAndTopupSpend() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject hark = new org.json.JSONObject().put("provider", "hark").put("status", "ok").put("planLabel", "Hark Pro")
                .put("windows", new org.json.JSONArray()
                        .put(new org.json.JSONObject().put("kind", "daily").put("label", "Daily").put("used", 125).put("limit", 100).put("usedPercent", 125))
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Monthly").put("used", 20000).put("limit", 100000).put("usedPercent", 20))
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Top-up").put("metric", "spend").put("used", 1.25).put("currency", "USD").put("showMeter", false)));
        org.json.JSONObject qoder = new org.json.JSONObject().put("provider", "qoder").put("status", "unavailable")
                .put("windows", new org.json.JSONArray()
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Credits").put("used", 20).put("limit", 100).put("usedPercent", 20))
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Team credits").put("used", 10).put("limit", 50).put("usedPercent", 20)));
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false)).put("limits",
                new org.json.JSONObject().put("providers", new org.json.JSONArray().put(hark).put(qoder)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 2 && document.body.innerText.includes('125 / 100')");
        assertEquals("true", evaluate("document.body.innerText.includes('Hark Pro') && document.body.innerText.includes('20K / 100K') && document.body.innerText.includes('$1.25') && document.querySelector('[data-limit-account]').querySelectorAll('[style]').length === 2"));
        assertEquals("true", evaluate("document.body.innerText.includes('Qoder') && document.body.innerText.includes('Team credits') && document.body.innerText.includes('20/100') && document.body.innerText.includes('10/50') && document.body.innerText.includes('读取失败')"));
    }

    @Test public void cacheHitKeepsCompletedAndZeroReadingsAndGatesLifetimeDays() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(true));
        org.json.JSONObject period = stats.getJSONObject("periods").getJSONObject("today");
        period.put("totalTokens", 1000).put("cacheReadTokens", 600).put("cacheWriteTokens", 100).put("inputTokens", 100)
                .put("outputTokens", 100).put("unclassifiedTokens", 100).put("capabilities", new org.json.JSONObject().put("tokenComponents", true));
        period.put("sessions", new org.json.JSONObject()
                .put("codex:done", new org.json.JSONObject().put("client", "codex").put("sessionId", "done").put("title", "Completed cached session")
                        .put("inputTokens", 100).put("cacheReadTokens", 600).put("cacheWriteTokens", 100).put("turnEnded", true))
                .put("codex:zero", new org.json.JSONObject().put("client", "codex").put("title", "Measured zero hits").put("inputTokens", 100).put("cacheReported", true))
                .put("unknown", new org.json.JSONObject().put("title", "Unknown cache telemetry").put("inputTokens", 100)));
        org.json.JSONObject summary = new org.json.JSONObject().put("activeDays", 999).put("activeDaysComplete", false);
        stats.put("historyPreview", new org.json.JSONObject().put("summary", summary).put("daily", new org.json.JSONArray()
                .put(new org.json.JSONObject().put("date", "2026-11-10").put("tokens", 1000))));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"overview\"]').click()");
        awaitScript("document.querySelector('[data-cache-hit]').textContent.includes('75.0') && document.querySelector('[data-cache-sessions]')");
        assertEquals("true", evaluate("document.querySelector('[data-active-days]').textContent.includes('所示日期') && !document.querySelector('[data-active-days]').textContent.includes('999')"));
        evaluate("document.querySelector('[data-cache-sessions] summary').click()");
        awaitScript("document.querySelector('[data-cache-sessions]').open && document.querySelectorAll('[data-cache-sessions] li').length === 2");
        assertEquals("true", evaluate("document.querySelector('[data-cache-sessions]').textContent.includes('Completed cached session') && document.querySelector('[data-cache-sessions]').textContent.includes('0.0%') && !document.querySelector('[data-cache-sessions]').textContent.includes('Unknown cache telemetry')"));
        summary.put("activeDaysComplete", true); publishStats(stats);
        awaitScript("document.querySelector('[data-active-days]').textContent.includes('累计活跃') && document.querySelector('[data-active-days]').textContent.includes('999')");
        stats.getJSONObject("periods").put("today", new org.json.JSONObject().put("totalTokens", 1000)); publishStats(stats);
        awaitScript("document.querySelector('[data-cache-hit]').textContent.includes('—') && !document.querySelector('[data-cache-sessions]')");
    }

    @Test public void newUsageClientsKeepLabelsAccountingAndToolFilters() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject sessions = new org.json.JSONObject(), clients = new org.json.JSONObject();
        String fresh = java.time.Instant.now().toString();
        for (String id : new String[]{"gemini", "mistral", "prime-agent", "jcode"}) {
            sessions.put(id + ":same", new org.json.JSONObject().put("client", id).put("sessionId", "same").put("title", "Same title")
                    .put("totalTokens", 120).put("inputTokens", 80).put("outputTokens", 20).put("cacheReadTokens", 20).put("lastUsedAt", fresh));
            clients.put(id, 120);
        }
        org.json.JSONObject period = new org.json.JSONObject().put("sessions", sessions).put("clients", clients).put("totalTokens", 480);
        org.json.JSONObject periods = new org.json.JSONObject().put("today", period);
        org.json.JSONObject stats = new org.json.JSONObject().put("periods", periods).put("devices", new org.json.JSONArray()
                .put(new org.json.JSONObject().put("deviceId", "pc").put("updatedAt", fresh).put("stale", false).put("periods", periods)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 4 && document.querySelector('[data-session-tool=\"gemini\"]')");
        assertEquals("true", evaluate("document.querySelector('[data-session-tool=\"gemini\"]').textContent.includes('Gemini CLI') && document.querySelector('[data-session-tool=\"mistral\"]').textContent.includes('Mistral Vibe') && document.body.innerText.includes('Prime Agent') && document.body.innerText.includes('Jcode')"));
        evaluate("document.querySelector('[data-session-tool=\"mistral\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 1 && document.querySelector('.session').textContent.includes('120')");
        assertEquals("true", evaluate("document.querySelector('[data-state-source=\"inferred\"]') && !document.querySelector('[data-state-source=\"native\"]')"));
    }

    @Test public void mistralAllowancesAndMimoWalletDetailsRemainIndependent() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject mistral = new org.json.JSONObject().put("provider", "mistral").put("status", "ok").put("source", "web")
                .put("windows", new org.json.JSONArray()
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Included API").put("usedPercent", 25).put("used", 25).put("limit", 100).put("currency", "USD"))
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Included Vibe Code").put("usedPercent", 68))
                        .put(new org.json.JSONObject().put("kind", "billing").put("label", "Balance").put("metric", "credits").put("remaining", 12).put("currency", "USD").put("showMeter", false)));
        org.json.JSONObject mimo = new org.json.JSONObject().put("provider", "mimo").put("accountKey", "console").put("accountLabel", "Console").put("status", "error")
                .put("balance", new org.json.JSONObject().put("amount", 50).put("currency", "CNY").put("giftBalance", 0).put("cashBalance", 30));
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false)).put("limits",
                new org.json.JSONObject().put("providers", new org.json.JSONArray().put(mistral).put(mimo)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 2 && document.body.innerText.includes('$25.00 / $100.00')");
        assertEquals("true", evaluate("document.body.innerText.includes('Included Vibe Code') && document.body.innerText.includes('68% 已用') && document.body.innerText.includes('剩余 $12.00') && document.querySelector('[data-limit-account]').querySelectorAll('[style]').length === 2"));
        evaluate("document.querySelector('[data-balance-details] summary').click()");
        awaitScript("document.querySelector('[data-balance-details]').open && document.querySelector('[data-balance-details]').textContent.includes('¥0.00')");
        assertEquals("true", evaluate("document.body.innerText.includes('MiMo Console') && document.body.innerText.includes('剩余 ¥50.00') && document.querySelector('[data-balance-details]').textContent.includes('¥30.00') && document.body.innerText.includes('读取失败')"));
    }

    @Test public void minimaxProductsRenderSeparatePointsCashSpendAndUnlimitedWindows() throws Exception {
        awaitConnectionPage();
        String codeKey = "sha256:" + String.join("", Collections.nCopies(64, "a"));
        String apiKey = "sha256:" + String.join("", Collections.nCopies(64, "b"));
        org.json.JSONObject code = new org.json.JSONObject().put("provider", "minimax").put("accountKey", codeKey)
                .put("source", "oauth").put("region", "cn").put("accountLabel", "MiniMax Code").put("planLabel", "Starter").put("status", "ok")
                .put("windows", new org.json.JSONArray()
                        .put(new org.json.JSONObject().put("kind", "billing").put("metric", "credits").put("remaining", 4624).put("currency", "CREDITS"))
                        .put(new org.json.JSONObject().put("kind", "session").put("label", "5h").put("detail", "unlimited").put("showMeter", false))
                        .put(new org.json.JSONObject().put("kind", "weekly").put("label", "Video").put("used", 3).put("limit", 20).put("usedPercent", 15)));
        org.json.JSONObject api = new org.json.JSONObject().put("provider", "minimax").put("accountKey", apiKey).put("relatedAccountKey", codeKey)
                .put("source", "api").put("region", "cn").put("accountLabel", "Pay-as-you-go").put("status", "unauthorized")
                .put("windows", new org.json.JSONArray().put(new org.json.JSONObject().put("kind", "billing").put("metric", "credits").put("remaining", 14.97).put("currency", "CNY")))
                .put("balance", new org.json.JSONObject().put("amount", 14.97).put("currency", "CNY").put("todaySpend", 0).put("monthSpend", 5.66));
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false)).put("limits",
                new org.json.JSONObject().put("providers", new org.json.JSONArray().put(api).put(code)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 2 && document.querySelector('[data-limit-linked-group]')");
        assertEquals("true", evaluate("document.querySelectorAll('[data-limit-account]')[0].textContent.includes('MiniMax Code') && document.querySelectorAll('[data-limit-account]')[1].textContent.includes('MiniMax API')"));
        assertEquals("true", evaluate("document.body.innerText.includes('4624.00 积分') && document.body.innerText.includes('无限额') && document.body.innerText.includes('3/20 次') && document.body.innerText.includes('API 凭据失效')"));
        assertEquals("true", evaluate("document.querySelector('[data-limit-spend]').textContent.includes('¥0.00') && document.querySelector('[data-limit-spend]').textContent.includes('—') && !document.querySelectorAll('[data-limit-account]')[0].querySelector('[data-limit-spend]')"));
    }

    @Test public void upstreamLimitsKeepOrganizationsDevicesAndWalletsDistinct() throws Exception {
        awaitConnectionPage();
        org.json.JSONArray providers = new org.json.JSONArray("["
                + "{\"provider\":\"claude\",\"accountKey\":\"sha256:one\",\"accountEmail\":\"viewer@example.com\",\"accountName\":\"Team One\",\"status\":\"ok\",\"windows\":[{\"kind\":\"session\",\"usedPercent\":25}]},"
                + "{\"provider\":\"claude\",\"accountKey\":\"sha256:two\",\"accountEmail\":\"viewer@example.com\",\"accountName\":\"Team Two\",\"status\":\"ok\",\"windows\":[{\"kind\":\"session\",\"usedPercent\":75}]},"
                + "{\"provider\":\"muse\",\"sourceDeviceId\":\"workstation\",\"status\":\"ok\",\"windows\":[{\"kind\":\"weekly\",\"usedPercent\":80}]},"
                + "{\"provider\":\"muse\",\"sourceDeviceId\":\"laptop\",\"status\":\"notConfigured\",\"windows\":[]},"
                + "{\"provider\":\"ollama\",\"status\":\"ok\",\"windows\":["
                + "{\"kind\":\"billing\",\"label\":\"Included credits\",\"metric\":\"credits\",\"remaining\":52.5,\"used\":7.5,\"limit\":60,\"usedPercent\":12.5,\"currency\":\"USD\"},"
                + "{\"kind\":\"billing\",\"label\":\"Credit balance\",\"metric\":\"credits\",\"remaining\":18.25,\"currency\":\"USD\",\"showMeter\":false,\"resetDescription\":\"Refills to $30 in 3 weeks.\"},"
                + "{\"kind\":\"billing\",\"label\":\"Monthly credits used\",\"metric\":\"spend\",\"used\":4.5,\"currency\":\"USD\",\"showMeter\":false}]}]");
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        stats.put("limits", new org.json.JSONObject().put("providers", providers));
        stats.put("devices", new org.json.JSONArray()
                .put(new org.json.JSONObject().put("deviceId", "workstation").put("hostname", "Development"))
                .put(new org.json.JSONObject().put("deviceId", "laptop").put("hostname", "Development")));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 4 && Boolean(document.querySelector('[data-limits-show-hidden]'))");
        evaluate("document.querySelector('[data-limits-show-hidden]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 5");
        assertEquals("true", evaluate("new Set(Array.from(document.querySelectorAll('[data-limit-account]'), row => row.dataset.limitAccount)).size === 5"));
        assertEquals("true", evaluate("document.body.innerText.includes('Development · workstation') && document.body.innerText.includes('Development · laptop') && document.body.innerText.includes('未配置')"));
        assertEquals("true", evaluate("(() => { const card = Array.from(document.querySelectorAll('[data-limit-account]')).find(row => row.innerText.includes('Ollama'));"
                + " return card.innerText.includes('剩余 $52.50') && card.innerText.includes('已用 $7.50 / 总额 $60.00')"
                + " && card.innerText.includes('剩余 $18.25') && card.innerText.includes('$4.50')"
                + " && card.innerText.includes('Refills to $30 in 3 weeks.') && card.querySelectorAll('[style]').length === 1; })()"));
        // Replacing and removing same-email rows must not leave a reconciled
        // card behind under React's keyed list updates.
        stats.getJSONObject("limits").put("providers", new org.json.JSONArray()
                .put(providers.getJSONObject(1)).put(providers.getJSONObject(0)));
        publishStats(stats);
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 2 && document.querySelector('[data-limit-account]').innerText.includes('Team Two')");
        stats.getJSONObject("limits").put("providers", new org.json.JSONArray().put(providers.getJSONObject(1)));
        publishStats(stats);
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 1 && !document.getElementById('content').innerText.includes('Team One')");
    }

    @Test public void copilotKeepsNamedAccountsAndShowsAnExpiredLoginByDefault() throws Exception {
        awaitConnectionPage();
        org.json.JSONArray providers = new org.json.JSONArray("""
                [
                  {"provider":"copilot","accountKey":"sha256:personal","accountName":"same-login",
                   "source":"api","sourceDetail":"managed","status":"ok",
                   "windows":[{"kind":"billing","label":"Premium","usedPercent":25}]},
                  {"provider":"copilot","accountKey":"sha256:enterprise","accountName":"same-login",
                   "source":"api","sourceDetail":"managed","status":"unauthorized","windows":[]},
                  {"provider":"copilot","source":"api","status":"notConfigured","windows":[]}
                ]
                """);
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false))
                .put("limits", new org.json.JSONObject().put("providers", providers));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 2");
        assertEquals("true", evaluate("(() => { const cards = [...document.querySelectorAll('[data-limit-account]')];"
                + " return cards[0].dataset.limitAccount !== cards[1].dataset.limitAccount"
                + " && cards.every(card => card.innerText.includes('same-login'))"
                + " && cards.some(card => card.innerText.includes('Premium') && card.innerText.includes('25%'))"
                + " && cards.some(card => card.innerText.includes('需重新登录') && !card.innerText.includes('Premium')); })()"));
    }

    @Test public void upstream84ShowsMuseProductsCreditsAndSessionMetadata() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        org.json.JSONObject row = stats.getJSONObject("periods").getJSONObject("today")
                .getJSONObject("sessions").getJSONObject("codex:test");
        row.put("reasoningEffort", "high").put("models", new org.json.JSONObject().put("gpt-5", 1234))
                .put("promptCache", new org.json.JSONObject().put("observedAt", java.time.Instant.now().toString()).put("ttlSeconds", 1800))
                .put("modelTokenComponents", new org.json.JSONObject().put("gpt-5", new org.json.JSONObject()
                        .put("totalTokens", 80).put("inputTokens", 20).put("outputTokens", 20)
                        .put("cacheReadTokens", 30).put("cacheWriteTokens", 10)));
        String tomorrow = java.time.Instant.now().plusSeconds(86400).toString();
        org.json.JSONArray providers = new org.json.JSONArray("["
                + "{\"provider\":\"muse\",\"source\":\"cli\",\"sourceDeviceId\":\"test-pc\",\"status\":\"ok\",\"windows\":[{\"kind\":\"session\",\"usedPercent\":25}]},"
                + "{\"provider\":\"muse\",\"source\":\"web\",\"sourceDeviceId\":\"test-pc\",\"status\":\"ok\",\"windows\":["
                + "{\"kind\":\"weekly\",\"usedPercent\":3,\"resetsAt\":\"" + tomorrow + "\",\"resetDescription\":\"2.8B tokens left\"},"
                + "{\"kind\":\"billing\",\"metric\":\"credits\",\"remaining\":60,\"currency\":\"USD\",\"showMeter\":false,\"resetDescription\":\"1.5B tokens left\"}]},"
                + "{\"provider\":\"manus\",\"status\":\"ok\",\"windows\":[{\"kind\":\"billing\",\"metric\":\"credits\",\"remaining\":1180,\"currency\":\"CREDITS\",\"showMeter\":false}]}]");
        stats.put("limits", new org.json.JSONObject().put("providers", providers));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelectorAll('[data-limit-account]').length === 3");
        assertEquals("true", evaluate("new Set(Array.from(document.querySelectorAll('[data-limit-account]'), row => row.dataset.limitAccount)).size === 3"));
        assertEquals("true", evaluate("document.body.innerText.includes('Muse Code') && document.body.innerText.includes('Muse (Meta)') && document.body.innerText.includes('Manus')"));
        assertEquals("true", evaluate("document.body.innerText.includes('2.8B tokens left') && document.body.innerText.includes('剩余 1.5B Tokens') && document.body.innerText.includes('1180.00 积分') && !document.body.innerText.includes('$60.00')"));
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-reasoning-effort=\"high\"]')");
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelector('[data-session-detail]')");
        evaluate("document.querySelector('[data-session-detail]').click()");
        awaitScript("document.getElementById('page-title').textContent === '会话详情'");
        assertEquals("true", evaluate("document.body.innerText.includes('推理强度') && document.body.innerText.includes('high') && !document.body.innerText.includes('预计租约还剩')"));
        assertEquals("true", evaluate("document.querySelector('[data-model-components=\"gpt-5\"]').innerText.includes('80 / 1,234 Tokens') && document.body.innerText.includes('其余 Tokens 的组成未知')"));
    }

    @Test public void upstream85FiltersToolsAndShowsEverySourceDevice() throws Exception {
        awaitConnectionPage();
        String now = java.time.Instant.now().toString();
        org.json.JSONObject main = new org.json.JSONObject().put("client", "codex").put("sessionId", "main")
                .put("title", "Remote work").put("totalTokens", 100).put("costUsd", 1).put("lastUsedAt", now);
        org.json.JSONObject child = new org.json.JSONObject().put("client", "claude").put("sessionId", "child")
                .put("parentClient", "codex").put("parentSessionId", "main").put("title", "Delegated task")
                .put("totalTokens", 50).put("costUsd", 0.5).put("lastUsedAt", now);
        org.json.JSONObject other = new org.json.JSONObject().put("client", "senpi").put("sessionId", "other")
                .put("totalTokens", 25).put("lastUsedAt", now);
        org.json.JSONObject sessions = new org.json.JSONObject().put("codex:main", main)
                .put("claude:child", child).put("senpi:other", other);
        org.json.JSONObject periods = new org.json.JSONObject().put("today", new org.json.JSONObject()
                .put("totalTokens", 175).put("sessions", sessions));
        org.json.JSONArray devices = new org.json.JSONArray()
                .put(new org.json.JSONObject().put("deviceId", "laptop").put("hostname", "Work").put("deviceKind", "laptop")
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("sessions", new org.json.JSONObject().put("codex:main", main)))))
                .put(new org.json.JSONObject().put("deviceId", "server").put("hostname", "Work").put("deviceKind", "server")
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("sessions", new org.json.JSONObject().put("claude:child", child).put("senpi:other", other)))));
        org.json.JSONObject stats = new org.json.JSONObject().put("periods", periods).put("devices", devices);
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 2 && document.querySelector('[data-session-tool=\"claude\"]')");
        evaluate("document.querySelector('[data-session-tool=\"claude\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 1 && document.querySelector('[data-session-tool=\"claude\"]').getAttribute('aria-pressed') === 'true'");
        assertEquals("true", evaluate("document.querySelector('.session').textContent.includes('150') && document.querySelectorAll('[data-session-device]').length === 2"));
        assertEquals("true", evaluate("document.querySelector('[data-session-device=\"laptop\"] [data-device-kind=\"laptop\"]') && Boolean(document.querySelector('[data-session-device=\"server\"] [data-device-kind=\"server\"]'))"));
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelectorAll('[data-session-member]').length === 2");
        evaluate("document.querySelector('[data-session-member=\"claude%3Achild\"]').click()");
        awaitScript("document.getElementById('page-title').textContent === '会话详情' && document.querySelector('[data-device-kind=\"server\"]')");
        assertEquals("true", evaluate("window.handleBackNavigation()"));
        awaitScript("document.querySelector('[data-session-tool=\"claude\"]').getAttribute('aria-pressed') === 'true'");
        sessions.remove("claude:child");
        publishStats(stats);
        awaitScript("!document.querySelector('[data-session-tool=\"claude\"]') && document.querySelector('[data-session-tool=\"\"]').getAttribute('aria-pressed') === 'true'");
        evaluate("document.querySelector('[data-page=\"devices\"]').click()");
        awaitScript("document.querySelector('[data-device-kind=\"laptop\"]') && document.querySelector('[data-device-kind=\"server\"]')");
    }

    private void publishStats(org.json.JSONObject stats) throws Exception {
        String snapshot = new org.json.JSONObject().put("type", "stats").put("data", stats)
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
    }

    @Test public void endedFilterNeverIncludesUnknownIdleOrArchivedSessions() throws Exception {
        awaitConnectionPage();
        long now = System.currentTimeMillis();
        String fresh = java.time.Instant.ofEpochMilli(now - 1000).toString();
        org.json.JSONObject sessions = new org.json.JSONObject()
                .put("codex:running", new org.json.JSONObject().put("client", "codex").put("sessionId", "running")
                        .put("lastUsedAt", fresh).put("turnEnded", false))
                .put("codex:ended", new org.json.JSONObject().put("client", "codex").put("sessionId", "ended")
                        .put("lastUsedAt", fresh).put("turnEnded", true))
                .put("codex:idle", new org.json.JSONObject().put("client", "codex").put("sessionId", "idle")
                        .put("lastUsedAt", java.time.Instant.ofEpochMilli(now - 700000).toString()).put("turnEnded", false))
                .put("codex:archived", new org.json.JSONObject().put("client", "codex").put("sessionId", "archived")
                        .put("lastUsedAt", fresh).put("archived", true));
        org.json.JSONObject periods = new org.json.JSONObject().put("today", new org.json.JSONObject()
                .put("totalTokens", 10).put("sessions", sessions));
        org.json.JSONObject stats = new org.json.JSONObject().put("periods", periods).put("devices", new org.json.JSONArray()
                .put(new org.json.JSONObject().put("deviceId", "pc").put("stale", false)
                        .put("updatedAt", fresh).put("periods", periods)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 4 && document.querySelector('[data-session-status-filter=\"ended\"]').textContent.replace(/\\s/g,'') === '已结束1'");
        evaluate("document.querySelector('[data-session-status-filter=\"ended\"]').click()");
        awaitScript("document.querySelectorAll('.session').length === 1 && document.querySelector('[data-session-state=\"ended\"]')");
        evaluate("window.receiveNative({type:'status',state:'offline'})");
        awaitScript("document.querySelectorAll('.session').length === 0 && document.querySelector('[data-session-status-filter=\"ended\"]').textContent.replace(/\\s/g,'') === '已结束0'");
        evaluate("document.querySelector('[data-session-status-filter=\"all\"]').click()");
        awaitScript("document.querySelectorAll('[data-session-state=\"unknown\"]').length === 3");
        publishStats(stats);
        evaluate("window.receiveNative({type:'lifecycle',foreground:false})");
        awaitScript("document.querySelectorAll('[data-session-state=\"unknown\"]').length === 3 && document.querySelector('[data-session-status-filter=\"ended\"]').textContent.replace(/\\s/g,'') === '已结束0'");
        evaluate("window.receiveNative({type:'lifecycle',foreground:true})");
        String expired = new org.json.JSONObject().put("type", "stats").put("data", stats).put("fetchedAt", now - 30000).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(expired) + ")");
        awaitScript("document.querySelectorAll('[data-session-state=\"unknown\"]').length === 3 && document.querySelector('[data-session-status-filter=\"ended\"]').textContent.replace(/\\s/g,'') === '已结束0'");
    }

    @Test public void overviewDevicesKeepUnavailablePeriodsSeparateFromZero() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        String now = java.time.Instant.now().toString();
        stats.getJSONArray("devices")
                .put(new org.json.JSONObject().put("deviceId", "zero").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("totalTokens", 0).put("costUsd", 0))))
                .put(new org.json.JSONObject().put("deviceId", "missing").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject()))
                .put(new org.json.JSONObject().put("deviceId", "expired").put("updatedAt", now)
                        .put("periods", stats.getJSONObject("periods"))
                        .put("periodWindows", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("endsAt", java.time.Instant.now().minusSeconds(60).toString()))));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        awaitScript("document.querySelectorAll('[data-overview-device]').length === 4");
        assertEquals("true", evaluate("document.querySelector('[data-overview-device=\"missing\"]').textContent.includes('暂无读数') && document.querySelector('[data-overview-device=\"missing\"]').textContent.includes('—')"));
        assertEquals("true", evaluate("document.querySelector('[data-overview-device=\"expired\"]').textContent.includes('周期已结束') && document.querySelector('[data-overview-device=\"expired\"]').textContent.includes('—')"));
        assertEquals("true", evaluate("document.querySelector('[data-overview-device=\"zero\"]').textContent.includes('$0.00') && !document.querySelector('[data-overview-device=\"zero\"]').textContent.includes('—')"));
        evaluate("document.querySelector('[data-overview-device=\"zero\"]').click()");
        awaitScript("document.querySelector('[data-clear-device]') && document.querySelector('.token-total').textContent.trim() === '0'");
        evaluate("document.querySelector('[data-clear-device]').click()");
        awaitScript("document.querySelectorAll('[data-overview-device]').length === 4 && document.querySelector('.token-total').textContent.trim() === window.MonitorModel.compact(1234)");
    }

    @Test public void overviewBreakdownSupportsPerDeviceDistributionToolsAndQuickFilter() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        String now = java.time.Instant.now().toString();
        stats.getJSONArray("devices").getJSONObject(0)
                .put("hostname", "Development").put("osName", "macOS")
                .getJSONObject("periods").getJSONObject("today")
                .put("clients", new org.json.JSONObject().put("codex", 1000))
                .put("clientCosts", new org.json.JSONObject().put("codex", 1.0));
        stats.getJSONArray("devices")
                .put(new org.json.JSONObject().put("deviceId", "dup-linux").put("hostname", "Development")
                        .put("deviceKind", "linux").put("osName", "Ubuntu").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("totalTokens", 400).put("costUsd", 2.5)
                                .put("clients", new org.json.JSONObject().put("claude", 400))
                                .put("clientCosts", new org.json.JSONObject().put("claude", 2.5)))))
                .put(new org.json.JSONObject().put("deviceId", "zero").put("hostname", "Idle").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("totalTokens", 0).put("costUsd", 0))))
                .put(new org.json.JSONObject().put("deviceId", "missing").put("hostname", "Silent").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject()))
                .put(new org.json.JSONObject().put("deviceId", "expired").put("hostname", "TimedOut").put("updatedAt", now)
                        .put("periods", stats.getJSONObject("periods"))
                        .put("periodWindows", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("endsAt", java.time.Instant.now().minusSeconds(60).toString()))))
                .put(new org.json.JSONObject().put("deviceId", "agentserver-mz32-ar0-00")
                        .put("hostname", "WIN-RJGDG7FKQ7M-AGENT").put("osName", "Debian GNU/Linux")
                        .put("osVersion", "13 (trixie) build 26100").put("updatedAt", now)
                        .put("periods", new org.json.JSONObject().put("today", new org.json.JSONObject()
                                .put("totalTokens", 50).put("costUsd", 0.1))));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        awaitScript("Array.from(document.querySelectorAll('[data-breakdown]')).map(el => el.getAttribute('data-breakdown')).join(',') === 'clients,devices,models,projects'");
        evaluate("document.querySelector('[data-overview-devices-jump=\"true\"]').click()");
        awaitScript("document.querySelector('[data-breakdown=\"devices\"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('[data-breakdown-device]').length === 6");
        assertEquals("true", evaluate("document.querySelector('[data-breakdown-device=\"test-pc\"]').textContent.includes('Development') && document.querySelector('[data-breakdown-device=\"dup-linux\"]').textContent.includes('dup-linux')"));
        assertEquals("true", evaluate("(() => { const card = document.querySelector('[data-breakdown-device=\"agentserver-mz32-ar0-00\"]'); return Boolean(card) && card.scrollWidth <= card.clientWidth && Array.from(card.querySelectorAll('span')).every(s => s.scrollWidth <= s.clientWidth + 1 && getComputedStyle(s).textOverflow !== 'ellipsis'); })()"));
        assertEquals("true", evaluate("document.querySelector('[data-breakdown-device=\"zero\"]').textContent.includes('$0.00') && !document.querySelector('[data-breakdown-device=\"zero\"]').textContent.includes('—')"));
        assertEquals("true", evaluate("document.querySelector('[data-breakdown-device=\"missing\"]').textContent.includes('暂无读数') && document.querySelector('[data-breakdown-device=\"missing\"]').textContent.includes('—')"));
        assertEquals("true", evaluate("document.querySelector('[data-breakdown-device=\"expired\"]').textContent.includes('周期已结束') && document.querySelector('[data-breakdown-device=\"expired\"]').textContent.includes('—')"));
        evaluate("document.querySelector('[data-breakdown-device-toggle=\"test-pc\"]').click()");
        awaitScript("document.querySelector('[data-breakdown-device-tools=\"test-pc\"]') !== null");
        assertEquals("true", evaluate("document.querySelector('[data-breakdown-device-tools=\"test-pc\"]').textContent.includes('Codex') && document.querySelector('[data-breakdown-device-tools=\"test-pc\"]').textContent.includes('未归因')"));
        evaluate("document.querySelector('[data-breakdown-sort=\"cost\"]').click()");
        awaitScript("document.querySelectorAll('[data-breakdown-device]')[0].getAttribute('data-breakdown-device') === 'dup-linux'");
        evaluate("const input = document.querySelector('[data-breakdown-search=\"true\"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'Ubuntu'); input.dispatchEvent(new Event('input', { bubbles: true }));");
        awaitScript("document.querySelectorAll('[data-breakdown-device]').length === 1 && document.querySelector('[data-breakdown-device=\"dup-linux\"]') !== null");
        evaluate("document.querySelector('[data-breakdown-device-filter=\"dup-linux\"]').click()");
        awaitScript("document.getElementById('device').value === 'dup-linux' && !document.querySelector('[data-breakdown=\"devices\"]') && document.querySelector('[data-breakdown=\"clients\"]').getAttribute('aria-pressed') === 'true'");
    }

    @Test public void devicePickerDialogSelectsDevicesAndHandlesBackNavigation() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        String now = java.time.Instant.now().toString();
        stats.getJSONArray("devices")
                .put(new org.json.JSONObject().put("deviceId", "lab-server").put("hostname", "Lab-Server")
                        .put("deviceKind", "server").put("stale", true).put("updatedAt", now));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        publishStats(stats);
        awaitScript("document.getElementById('device-picker-trigger') && document.getElementById('device-picker-trigger').textContent.includes('全部设备')");
        evaluate("document.getElementById('device-picker-trigger').click()");
        awaitScript("document.querySelector('#device-picker-dialog[open]') && document.querySelector('[data-device-option=\"lab-server\"]')");
        assertEquals("true", evaluate("document.querySelector('[data-device-option=\"lab-server\"] [data-device-kind=\"server\"]') !== null && document.querySelector('[data-device-option=\"lab-server\"]').textContent.includes('过期')"));
        assertEquals("true", evaluate("window.handleBackNavigation()"));
        awaitScript("!document.querySelector('#device-picker-dialog[open]')");
        evaluate("document.getElementById('device-picker-trigger').click()");
        awaitScript("document.querySelector('#device-picker-dialog[open]')");
        evaluate("document.querySelector('[data-device-option=\"test-pc\"]').click()");
        awaitScript("!document.querySelector('#device-picker-dialog[open]') && document.getElementById('device').value === 'test-pc' && !document.querySelector('.history-chart')");
        evaluate("document.getElementById('device-picker-trigger').click()");
        awaitScript("document.querySelector('#device-picker-dialog[open]')");
        evaluate("document.querySelector('[data-device-option=\"\"]').click()");
        awaitScript("!document.querySelector('#device-picker-dialog[open]') && document.getElementById('device').value === '' && Boolean(document.querySelector('.history-chart'))");
    }

    @Test public void dailyTrendKeepsRealDatesAndSelectionAcrossRefresh() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        stats.put("historyPreview", new org.json.JSONObject().put("daily", new org.json.JSONArray()
                .put(new org.json.JSONObject().put("date", "2026-10-20").put("tokens", 100).put("cost", 0.5))
                .put(new org.json.JSONObject().put("date", "2026-10-22").put("tokens", 300).put("cost", 1.25))));
        String snapshot = new org.json.JSONObject().put("type", "stats").put("data", stats)
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
        awaitScript("document.querySelectorAll('[data-trend]').length === 2");
        assertEquals("true", evaluate("document.querySelectorAll('[data-trend]').length === 2 && !document.body.innerText.includes('2026-10-21')"));
        evaluate("document.querySelector('[data-trend=\"2026-10-20\"]').click()");
        evaluate("document.querySelector('[data-daily-toggle]').click()");
        awaitScript("document.querySelector('[data-daily-values]')");
        evaluate("document.querySelector('[data-chart-mode=\"cumulative\"]').click()");
        awaitScript("document.querySelector('.history-chart').getAttribute('aria-label').includes('400 tokens')");
        assertEquals("true", evaluate("document.querySelector('.history-chart').getAttribute('aria-label').includes('400 tokens')"));
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
        assertEquals("true", evaluate("Boolean(document.querySelector('[data-trend=\"2026-10-20\"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-daily-values]'))"));
        assertEquals("true", evaluate("document.querySelector('.trend-selection').textContent.includes('$0.50')"));
        evaluate("document.getElementById('device').value = 'test-pc'; document.getElementById('device').dispatchEvent(new Event('change', {bubbles:true}))");
        awaitScript("!document.querySelector('.history-chart') && !document.querySelector('.trend-card')");
        assertEquals("true", evaluate("!document.querySelector('.history-chart') && !document.querySelector('.trend-card')"));
        evaluate("document.querySelector('[data-page=\"settings\"]').click()");
        awaitScript("document.querySelector('#settings-notifications #completion-settings')");
        assertEquals("true", evaluate("document.querySelector('#settings-notifications #completion-settings') && document.querySelectorAll('#monitor-enabled').length === 1"));
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('#session-tools #completion-settings')");
        assertEquals("true", evaluate("document.querySelector('#session-tools #completion-settings') && document.querySelectorAll('#monitor-enabled').length === 1"));
    }

    @Test public void antigravitySubagentsGroupAndNavigateByTheirAccountingKeys() throws Exception {
        awaitConnectionPage();
        String now = java.time.Instant.now().toString();
        org.json.JSONObject sessions = new org.json.JSONObject().put("antigravity:main",
                new org.json.JSONObject().put("client", "antigravity").put("sessionId", "main")
                        .put("title", "产品SKILL").put("totalTokens", 98498400).put("costUsd", 1)
                        .put("lastUsedAt", now));
        for (int i = 0; i < 16; i++) {
            sessions.put("antigravity:child-" + i, new org.json.JSONObject()
                    .put("client", "antigravity").put("sessionId", "child-" + i)
                    .put("parentSessionId", "main").put("title", "子代理 " + i)
                    .put("totalTokens", 100).put("costUsd", 0.1).put("lastUsedAt", now));
        }
        org.json.JSONObject periods = new org.json.JSONObject().put("today",
                new org.json.JSONObject().put("sessions", sessions).put("totalTokens", 98500000));
        org.json.JSONObject stats = new org.json.JSONObject().put("periods", periods)
                .put("devices", new org.json.JSONArray().put(new org.json.JSONObject()
                        .put("deviceId", "pc").put("updatedAt", now).put("stale", false).put("periods", periods)));
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        String snapshot = new org.json.JSONObject().put("type", "stats").put("data", stats)
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-subagent-count=\"16\"]')");
        assertEquals("true", evaluate("document.querySelectorAll('.session').length === 1 && document.querySelector('.session').textContent.includes('98.5M')"));
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelectorAll('[data-session-member]').length === 17");
        evaluate("document.querySelector('[data-session-member=\"antigravity%3Achild-0\"]').click()");
        awaitScript("document.getElementById('page-title').textContent === '会话详情' && document.body.innerText.includes('child-0')");
        assertEquals("true", evaluate("window.handleBackNavigation()"));
        awaitScript("document.querySelector('[data-subagent-count=\"16\"]')");
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelectorAll('[data-session-member]').length === 17");
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
        assertEquals("true", evaluate("document.querySelector('.session-toggle').getAttribute('aria-expanded') === 'true'"));
    }

    @Test public void statsRefreshUsesCurrentClockAndKeepsTheSessionExpanded() throws Exception {
        awaitConnectionPage();
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        String initial = new org.json.JSONObject().put("type", "stats").put("data", new org.json.JSONObject(testStats(false)))
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(initial) + ")");
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-session-state=\"running\"][data-state-source=\"native\"]')");
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelector('.session-toggle').getAttribute('aria-expanded') === 'true'");
        Thread.sleep(1100);
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        org.json.JSONObject aggregate = stats.getJSONObject("periods").getJSONObject("today");
        org.json.JSONObject owned = stats.getJSONArray("devices").getJSONObject(0).getJSONObject("periods").getJSONObject("today");
        for (org.json.JSONObject period : new org.json.JSONObject[] { aggregate, owned }) {
            period.put("totalTokens", 2468);
            period.getJSONObject("sessions").getJSONObject("codex:test").put("totalTokens", 2468);
        }
        String refreshed = new org.json.JSONObject().put("type", "stats").put("data", stats)
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(refreshed) + ")");
        awaitScript("document.querySelector('.session').textContent.includes('2.47K')");
        assertEquals("true", evaluate("Boolean(document.querySelector('[data-session-state=\"running\"][data-state-source=\"native\"]'))"));
        assertEquals("true", evaluate("document.querySelector('.session-toggle').getAttribute('aria-expanded') === 'true'"));
    }

    @Test public void conversationIsRequestedOnClickPagedAndRenderedAsText() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        String revision = "aaaaaaaaaaaaaaaaaaaaaaaa";
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            if (first.contains("/api/session-conversations?") && header.startsWith("Authorization: ")) authorizations.add(header);
                        }
                        String body;
                        if (first.contains("/api/session-conversations?")) {
                            boolean next = first.contains("cursor=" + revision + "%3A2");
                            org.json.JSONArray messages = new org.json.JSONArray();
                            if (next) {
                                messages.put(new org.json.JSONObject().put("id", "2").put("role", "tool").put("kind", "tool_result")
                                        .put("text", "native tool output").put("timestamp", "").put("continued", false));
                            } else {
                                messages.put(new org.json.JSONObject().put("id", "0").put("role", "user").put("kind", "message")
                                        .put("text", "native conversation question").put("timestamp", "").put("continued", false));
                                messages.put(new org.json.JSONObject().put("id", "1").put("role", "assistant").put("kind", "message")
                                        .put("text", "<img id=unsafe-conversation src=x onerror=alert(1)>native reply").put("timestamp", "").put("continued", false));
                            }
                            body = new org.json.JSONObject().put("revision", revision).put("nextCursor", next ? "" : revision + ":2")
                                    .put("incomplete", false).put("messages", messages).toString();
                        } else body = first.contains("/api/subscriptions ") ? "{\"subscriptions\":[],\"updatedAt\":\"\"}" : testStats(false);
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (Exception error) { if (!server.isClosed()) throw new RuntimeException(error); }
                }
            }, "conversation-test-hub");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'conversation-test-secret', true)");
                awaitScript("document.querySelector('.token-total')");
                evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
                awaitScript("document.querySelector('.session-toggle')");
                evaluate("document.querySelector('.session-toggle').click()");
                awaitScript("document.querySelector('[data-session-detail]')");
                evaluate("document.querySelector('[data-session-detail]').click()");
                awaitScript("document.querySelector('[data-read-conversation]:not(:disabled)')");
                assertEquals(0, requests.stream().filter(value -> value.contains("/api/session-conversations?")).count());
                evaluate("document.querySelector('[data-read-conversation]').click()");
                awaitScript("document.querySelector('[data-conversation-messages]').textContent.includes('native conversation question')");
                assertEquals("true", evaluate("document.querySelector('[data-conversation-messages]').textContent.includes('<img id=unsafe-conversation') && !document.getElementById('unsafe-conversation')"));
                assertEquals("true", evaluate("document.querySelectorAll('[data-message-role=\"user\"]').length === 1 && document.querySelectorAll('[data-message-role=\"assistant\"]').length === 1"));
                evaluate("document.querySelector('[data-more-conversation]').click()");
                awaitScript("document.querySelector('[data-event-group-toggle]') && !document.querySelector('[data-message-role=\"tool\"]') && !document.querySelector('[data-more-conversation]')");
                evaluate("document.querySelector('[data-event-group-toggle]').click()");
                awaitScript("document.querySelector('[data-message-role=\"tool\"]')");
                evaluate("document.querySelector('[data-message-role=\"tool\"]').open = true");
                assertEquals("true", evaluate("document.querySelector('[data-message-role=\"tool\"]').textContent.includes('native tool output')"));
                assertEquals(2, requests.stream().filter(value -> value.contains("/api/session-conversations?")).count());
                assertTrue(authorizations.stream().allMatch(value -> value.equals("Authorization: Bearer conversation-test-secret")));
                evaluate("document.querySelector('[data-back-sessions]').click()");
                awaitScript("document.querySelector('.session') && !document.querySelector('[data-conversation-messages]')");
            } finally {
                scenario.close();
                scenario = null;
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void sessionRealtimeUsesSourceDeltasAndClearsOnBackground() throws Exception {
        awaitConnectionPage();
        org.json.JSONObject stats = new org.json.JSONObject(testStats(false));
        org.json.JSONObject today = stats.getJSONObject("periods").getJSONObject("today");
        org.json.JSONObject row = today.getJSONObject("sessions").getJSONObject("codex:test");
        org.json.JSONObject device = stats.getJSONArray("devices").getJSONObject(0);
        device.getJSONObject("periods").put("today", today);
        row.put("totalTokens", 100000).put("timedOutputTokens", 33000).put("timedDurationMs", 1000000);
        today.put("totalTokens", 100000);
        evaluate("window.receiveNative({type:'connection',url:'https://realtime.example'})");
        publishStats(stats);
        awaitScript("document.querySelector('.token-total')");
        evaluate("window.receiveNative({type:'status',state:'online'})");
        awaitScript("document.querySelector('.token-total') && document.getElementById('status-label').textContent==='已连接'");
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('.session-toggle')");
        evaluate("document.querySelector('.session-toggle').click()");
        awaitScript("document.querySelector('[data-session-detail]')");
        evaluate("document.querySelector('[data-session-detail]').click()");
        awaitScript("document.querySelector('[data-session-realtime]')");
        assertEquals("true", evaluate("document.querySelector('[data-rate-output=\"second\"]').textContent==='—'"));

        long end = System.currentTimeMillis();
        String first = java.time.Instant.ofEpochMilli(end - 5000).toString();
        String second = java.time.Instant.ofEpochMilli(end).toString();
        device.put("periodWindows", new org.json.JSONObject().put("today", new org.json.JSONObject()
                .put("key", second.substring(0, 10)).put("endsAt", java.time.Instant.ofEpochMilli(end + 3600000).toString())));
        row.put("outputTokens", 10000);
        device.put("updatedAt", first).put("receivedAt", first);
        evaluate("window.receiveNative({type:'stats',data:" + stats + ",fetchedAt:Date.now()})");
        awaitScript("document.querySelector('[data-session-realtime]').dataset.realtimeState==='waiting'");
        row.put("outputTokens", 10150);
        device.put("updatedAt", second).put("receivedAt", second);
        evaluate("window.receiveNative({type:'stats',data:" + stats + ",fetchedAt:Date.now()})");
        awaitScript("document.querySelector('[data-rate-output=\"second\"]').textContent==='30'");
        assertEquals("true", evaluate("Number(document.querySelector('[data-rate-output=\"minute\"]').textContent.replace(/,/g,''))===1800"));
        assertEquals("true", evaluate("document.querySelectorAll('[data-realtime-chart] polyline').length===1"));
        evaluate("window.receiveNative({type:'status',state:'offline'})");
        awaitScript("document.querySelector('[data-session-realtime]').dataset.realtimeState==='unavailable'");
        assertEquals("true", evaluate("document.querySelector('[data-rate-output=\"second\"]').textContent==='—'"));
        evaluate("window.receiveNative({type:'lifecycle',foreground:false})");
        awaitScript("!document.querySelector('[data-realtime-chart] polyline')");
    }

    @Test public void nativeBridgeConnectsAndDisplaysAuthenticatedHubStats() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        AtomicReference<String> completedStats = new AtomicReference<>();
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            if (header.startsWith("Authorization: ")) authorizations.add(header);
                        }
                        String body;
                        if (first.contains("/api/subscriptions ")) {
                            body = "{\"subscriptions\":[],\"updatedAt\":\"\"}";
                        } else {
                            // Generate active evidence after the client's request began.
                            // A request-start clock would discard every active baseline.
                            Thread.sleep(100L);
                            String ended = completedStats.get();
                            body = ended == null ? testStats(false) : ended;
                        }
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException canceled) {
                        // Moving the viewer to the background cancels its in-flight
                        // foreground read; the fixture must keep serving the monitor.
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-hub");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'startup-test-secret', true)");
                awaitScript("document.querySelector('.token-total') && document.querySelector('.token-total').textContent === '1.23K'");
                awaitScript("document.getElementById('status-label').textContent === '已连接'");
                assertEquals("true", evaluate("document.body.innerText.includes('$1.25') && document.querySelectorAll('.trend-bar').length === 1"));
                evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
                awaitScript("document.querySelector('[data-session-state=\"running\"][data-state-source=\"native\"]')");
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                awaitScript("document.querySelector('[data-session-state=\"unknown\"]') && document.body.innerText.includes('已暂停')");
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                awaitScript("document.querySelector('[data-session-state=\"running\"][data-state-source=\"native\"]')");
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
                            "com.tokenmonitor.android", android.Manifest.permission.POST_NOTIFICATIONS);
                }
                evaluate("window.HubNative.monitor(true)");
                long deadline = System.currentTimeMillis() + 20000;
                while ((!SessionMonitorService.running() || SessionMonitorService.lastReadAt() == 0) && System.currentTimeMillis() < deadline) Thread.sleep(100);
                assertTrue("Background monitor must establish an active baseline", SessionMonitorService.running() && SessionMonitorService.lastReadAt() > 0);
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                // Reuse one end event to verify that repeated snapshots stay single-shot.
                completedStats.set(testStats(true));
                android.app.NotificationManager manager = InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(android.app.NotificationManager.class);
                android.service.notification.StatusBarNotification completion = null;
                deadline = System.currentTimeMillis() + 20000;
                while (completion == null && System.currentTimeMillis() < deadline) {
                    for (android.service.notification.StatusBarNotification item : manager.getActiveNotifications()) {
                        if (item.getTag() != null && item.getTag().startsWith("session:")) completion = item;
                    }
                    if (completion == null) Thread.sleep(100);
                }
                assertNotNull("Explicit end must notify while the viewer is stopped", completion);
                assertNotNull(completion.getNotification().publicVersion);
                long postedAt = completion.getPostTime();
                Thread.sleep(5500);
                for (android.service.notification.StatusBarNotification item : manager.getActiveNotifications()) {
                    if (completion.getTag().equals(item.getTag())) assertEquals("Repeated ended snapshots must not re-notify", postedAt, item.getPostTime());
                }
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                AtomicReference<Intent> launchIntent = new AtomicReference<>();
                scenario.onActivity(activity -> launchIntent.set(new Intent(activity.getIntent())));
                completion.getNotification().contentIntent.send();
                awaitScript("document.getElementById('page-title').textContent === '会话详情' && document.body.innerText.includes('codex:test')");
                scenario.onActivity(activity -> {
                    assertTrue("Notification routing must preserve the Activity launch identity",
                            launchIntent.get().filterEquals(activity.getIntent()));
                    assertFalse("Notification routing must be consumed once",
                            activity.getIntent().hasExtra(SessionNotifications.EXTRA_KEY));
                });
                // ActivityScenario must still observe lifecycle events after onNewIntent.
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                assertEquals(androidx.lifecycle.Lifecycle.State.RESUMED, scenario.getState());
                awaitScript("document.getElementById('page-title').textContent === '会话详情'");
                assertEquals("true", evaluate("window.handleBackNavigation()"));
                awaitScript("document.getElementById('page-title').textContent === '会话与状态'");
                assertTrue(requests.contains("GET /api/stats HTTP/1.1"));
                assertTrue(requests.contains("GET /api/subscriptions HTTP/1.1"));
                assertFalse(authorizations.isEmpty());
                for (String auth : new ArrayList<>(authorizations)) assertEquals("Authorization: Bearer startup-test-secret", auth);
                for (String line : new ArrayList<>(requests)) assertTrue("Unexpected write: " + line, line.startsWith("GET "));
                evaluate("window.HubNative.disconnect()");
                awaitConnectionPage();
                assertEquals("true", evaluate("!document.querySelector('.token-total')"));
            } finally {
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void auditedUiStateTransitionsAndNativeLimitsPreferences() throws Exception {
        awaitConnectionPage();
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        evaluate("window.receiveNative({type:'status',state:'online'})");
        evaluate("window.receiveNative({type:'stats',fetchedAt:Date.now(),data:" + testStats(false) + "})");
        awaitScript("document.getElementById('device-picker-trigger')");

        // 1. SessionsView must survive toggling to allTime and back without hook crashes.
        evaluate("document.querySelector('[data-page=\"sessions\"]').click()");
        awaitScript("document.querySelector('[data-session=\"codex%3Atest\"]')");
        evaluate("document.querySelector('[data-period=\"allTime\"]').click()");
        awaitScript("document.body.innerText.includes('累计会话明细不通过 Hub 同步')");
        evaluate("document.querySelector('[data-period=\"today\"]').click()");
        awaitScript("document.querySelector('[data-session=\"codex%3Atest\"]')");

        // 2. DevicePickerDialog opened before openSession must not reopen when navigating back.
        evaluate("document.getElementById('device-picker-trigger').click()");
        awaitScript("document.querySelector('#device-picker-dialog[open]')");
        evaluate("window.receiveNative({type:'openSession',key:'codex:test'})");
        awaitScript("document.getElementById('page-title').textContent === '会话详情'");
        assertEquals("true", evaluate("!document.querySelector('#device-picker-dialog[open]')"));
        assertEquals("true", evaluate("window.handleBackNavigation()"));
        awaitScript("document.getElementById('page-title').textContent === '会话与状态'");
        assertEquals("true", evaluate("!document.querySelector('#device-picker-dialog[open]')"));

        // 3. LimitsView preferences persist via native SharedPreferences across Activity recreation.
        String statsWithLimits = new org.json.JSONObject(testStats(false))
                .put("limits", new org.json.JSONObject().put("providers", new org.json.JSONArray().put(
                        new org.json.JSONObject().put("provider", "codex").put("status", "ok")
                                .put("windows", new org.json.JSONArray().put(
                                        new org.json.JSONObject().put("kind", "session").put("usedPercent", 20))))))
                .toString();
        evaluate("window.receiveNative({type:'stats',fetchedAt:Date.now(),data:" + statsWithLimits + "})");
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelector('[data-limits-mode-toggle]')");
        evaluate("document.querySelector('[data-limits-mode-toggle]').click()");
        awaitScript("document.querySelector('[data-limits-mode-toggle]').getAttribute('aria-pressed') === 'true'");
        scenario.recreate();
        awaitConnectionPage();
        evaluate("window.receiveNative({type:'connection',url:'https://monitor.example.com'})");
        evaluate("window.receiveNative({type:'stats',fetchedAt:Date.now(),data:" + statsWithLimits + "})");
        evaluate("document.querySelector('[data-page=\"limits\"]').click()");
        awaitScript("document.querySelector('[data-limits-mode-toggle]')");
        assertEquals("true", evaluate("document.querySelector('[data-limits-mode-toggle]').getAttribute('aria-pressed') === 'true'"));
    }

    @Test public void reportsViewFetchesAuthenticatedHubReportsAndHandlesBackNavigation() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            if (header.startsWith("Authorization: ")) authorizations.add(header);
                        }
                        String body;
                        if (first.contains("/api/subscriptions ")) {
                            body = "{\"subscriptions\":[],\"updatedAt\":\"\"}";
                        } else if (first.contains("/api/reports/weekly/current?format=both")) {
                            body = "{\"ok\":true,\"report\":{\"schemaVersion\":1,\"schema\":\"token-monitor-report/v1\","
                                    + "\"reportId\":\"weekly:2026-W47\",\"granularity\":\"weekly\","
                                    + "\"period\":{\"key\":\"2026-W47\",\"label\":\"2026-W47 (2026-11-16 ~ 2026-11-22)\","
                                    + "\"startDate\":\"2026-11-16\",\"endDate\":\"2026-11-22\",\"isCurrent\":true,\"generatedAt\":\"2026-11-16T14:00:00Z\"},"
                                    + "\"hub\":{\"runtime\":\"node-hub\",\"deviceCount\":1,\"activeDeviceCount\":1,\"staleDeviceCount\":0},"
                                    + "\"coverage\":{\"tokenComponentsComplete\":true,\"projectsComplete\":true,\"projectAttributionSource\":\"daily-snapshots\",\"historyComplete\":true},"
                                    + "\"summary\":{\"totalTokens\":5000,\"knownCostUsd\":0.15,\"cacheHitRatePct\":80,\"activeDays\":1,\"projectCount\":1,\"throughput\":{\"avgOutputTokensPerSec\":50}},"
                                    + "\"projects\":[{\"key\":\"token-monitor\",\"label\":\"token-monitor\",\"tokens\":5000,\"costUsd\":0.15,\"tokenSharePct\":100,\"costSharePct\":100,"
                                    + "\"clients\":[{\"client\":\"codex\",\"tokens\":5000,\"sharePct\":100}],\"models\":[{\"model\":\"gpt-5\",\"tokens\":5000,\"sharePct\":100}]}],"
                                    + "\"clients\":[],\"models\":[],\"devices\":[],\"timeline\":[],\"signals\":[]},"
                                    + "\"aiAnalysis\":{\"schemaVersion\":1,\"generatedAt\":\"2026-11-16T14:05:00Z\",\"protocol\":\"openai-compatible\","
                                    + "\"providerLabel\":\"DeepSeek\",\"model\":\"deepseek-chat\",\"language\":\"zh-CN\","
                                    + "\"summaryMarkdown\":\"## 核心结论\\n\\n- 主力工具 **codex** 消耗 **5.00K** tokens，Team New API 余额 **$42.50**。\\n- 缓存命中率 **80.0%**，效率良好。\\n\\n| 项目 | Tokens | 占比 |\\n| --- | ---: | ---: |\\n| token-monitor | 5,000 | 100.0% |\\n\\n<img id=unsafe-ai>\",\"stale\":false},"
                                    + "\"markdown\":\"# Weekly Report 2026-W47\\n\\n<img id=unsafe-report>\"}";
                        } else if (first.contains("/api/reports?")) {
                            body = "{\"ok\":true,\"config\":{\"enabled\":true,\"daily\":true,\"weekly\":true,\"monthly\":true},"
                                    + "\"integrations\":{\"ai\":{\"enabled\":true,\"protocol\":\"openai-compatible\",\"providerLabel\":\"DeepSeek\",\"model\":\"deepseek-chat\",\"apiKeyConfigured\":true},"
                                    + "\"openclaw\":{\"enabled\":true,\"mode\":\"openclaw-agent\",\"channel\":\"openclaw-weixin\",\"pushOnRollover\":true,\"hookTokenConfigured\":true},"
                                    + "\"lastPush\":{\"at\":\"2026-11-16T14:06:00Z\",\"ok\":true,\"channel\":\"openclaw-weixin\",\"reportId\":\"weekly:2026-W47\"}},"
                                    + "\"reports\":[{\"reportId\":\"weekly:2026-W47\",\"granularity\":\"weekly\",\"periodKey\":\"2026-W47\","
                                    + "\"label\":\"2026-W47\",\"startDate\":\"2026-11-16\",\"endDate\":\"2026-11-22\",\"totalTokens\":5000,\"knownCostUsd\":0.15,\"projectCount\":1,\"hasAiAnalysis\":true}]}";
                        } else {
                            body = new org.json.JSONObject(testStats(false))
                                    .put("limits", new org.json.JSONObject().put("providers", new org.json.JSONArray().put(
                                            new org.json.JSONObject().put("provider", "thirdparty").put("adapterId", "newapi-account")
                                                    .put("accountLabel", "Team New API").put("status", "ok")
                                                    .put("balance", new org.json.JSONObject().put("amount", 42.5).put("currency", "USD").put("monthSpend", 12.3)))))
                                    .toString();
                        }
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException ignored) {
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-reports-hub");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'reports-test-secret', true)");
                awaitScript("document.querySelector('[data-open-report=\"weekly\"]') && document.getElementById('header-reports-button')");
                assertEquals("true", evaluate("(() => {"
                        + " const header = document.querySelector('header');"
                        + " const reportsBtn = document.getElementById('header-reports-button');"
                        + " const connBtn = document.getElementById('connection-button');"
                        + " if (!header || !reportsBtn || !connBtn) return false;"
                        + " const h = header.getBoundingClientRect();"
                        + " const r = reportsBtn.getBoundingClientRect();"
                        + " const c = connBtn.getBoundingClientRect();"
                        + " return header.scrollWidth <= header.clientWidth + 1"
                        + " && r.width > 0 && r.left >= h.left - 1 && r.right <= h.right + 1 && r.right <= window.innerWidth + 1"
                        + " && c.width > 0 && c.left >= h.left - 1 && c.right <= h.right + 1 && c.right <= window.innerWidth + 1"
                        + " && r.right <= c.left + 1 && Math.abs(r.top - c.top) <= 4;"
                        + " })()"));
                evaluate("document.querySelector('[data-open-report=\"weekly\"]').click()");
                awaitScript("document.getElementById('page-title').textContent === '分析报告'");
                awaitScript("document.querySelector('[data-report-project=\"token-monitor\"]')");
                assertEquals("true", evaluate("document.getElementById('reports-summary-card').textContent.includes('2026-W47')"));
                awaitScript("document.getElementById('reports-openclaw-status') && document.getElementById('reports-ai-analysis') && document.getElementById('reports-thirdparty-quotas')");
                assertEquals("true", evaluate("document.getElementById('reports-openclaw-status').textContent.includes('openclaw-weixin')"));
                assertEquals("true", evaluate("document.getElementById('reports-thirdparty-quotas').textContent.includes('Team New API')"));
                assertEquals("true", evaluate("(() => {"
                        + " const ai = document.getElementById('reports-ai-analysis');"
                        + " if (!ai) return false;"
                        + " const h2 = ai.querySelector('h2');"
                        + " const table = ai.querySelector('table');"
                        + " const strongs = ai.querySelectorAll('strong');"
                        + " const items = ai.querySelectorAll('li');"
                        + " return ai.textContent.includes('deepseek-chat')"
                        + " && Boolean(h2) && h2.textContent.includes('核心结论')"
                        + " && Boolean(table) && table.querySelectorAll('th').length === 3 && table.textContent.includes('token-monitor')"
                        + " && strongs.length >= 4 && items.length >= 2"
                        + " && !ai.textContent.includes('**') && !ai.textContent.includes('|---|') && !ai.textContent.includes('| --- |')"
                        + " && ai.textContent.includes('<img id=unsafe-ai>') && !document.getElementById('unsafe-ai');"
                        + " })()"));

                evaluate("document.getElementById('reports-open-ai-window').click()");
                awaitScript("document.querySelector('#report-window-dialog[open]') && document.getElementById('report-win-核心结论') && document.querySelector('#report-window-dialog table')");
                assertEquals("true", evaluate("(() => {"
                        + " const dlg = document.querySelector('#report-window-dialog[open]');"
                        + " if (!dlg) return false;"
                        + " const rect = dlg.getBoundingClientRect();"
                        + " const aiH2 = document.getElementById('report-win-核心结论');"
                        + " return rect.width > 0 && rect.height > 0 && getComputedStyle(dlg).display !== 'none'"
                        + " && Boolean(aiH2) && aiH2.tagName === 'H2' && aiH2.textContent.includes('核心结论')"
                        + " && dlg.querySelector('table').textContent.includes('token-monitor')"
                        + " && dlg.textContent.includes('<img id=unsafe-ai>') && !document.getElementById('unsafe-ai');"
                        + " })()"));

                evaluate("document.querySelector('[data-report-window-tab=\"rendered\"]').click()");
                awaitScript("document.querySelector('[data-report-window-tab=\"rendered\"]').getAttribute('aria-selected') === 'true' && document.querySelector('#report-window-dialog h1')");
                assertEquals("true", evaluate("(() => {"
                        + " const dlg = document.getElementById('report-window-dialog');"
                        + " const h1 = dlg ? dlg.querySelector('h1') : null;"
                        + " return Boolean(h1) && h1.textContent.trim() === 'Weekly Report 2026-W47'"
                        + " && dlg.textContent.includes('<img id=unsafe-report>') && !document.getElementById('unsafe-report');"
                        + " })()"));

                evaluate("document.querySelector('[data-report-font-scale=\"lg\"]').click()");
                awaitScript("document.querySelector('[data-report-font-scale=\"lg\"]').getAttribute('aria-pressed') === 'true'");
                evaluate("document.querySelector('[data-report-window-tab=\"source\"]').click()");
                awaitScript("document.getElementById('report-window-source-pre') && document.getElementById('report-window-source-pre').textContent.includes('# Weekly Report 2026-W47')");
                assertEquals("true", evaluate("document.getElementById('report-window-source-pre').className.includes('text-[12.5px]') && document.getElementById('report-window-source-pre').textContent.includes('<img id=unsafe-report>') && !document.getElementById('unsafe-report')"));

                assertEquals("true", evaluate("window.handleBackNavigation()"));
                awaitScript("!document.querySelector('#report-window-dialog[open]')");
                assertEquals("true", evaluate("document.getElementById('page-title').textContent === '分析报告' && Boolean(document.getElementById('reports-view'))"));

                evaluate("document.querySelector('[data-report-view-mode=\"markdown\"]').click()");
                awaitScript("document.getElementById('reports-markdown-rendered') && document.querySelector('#reports-markdown-rendered h1')");
                assertEquals("true", evaluate("document.querySelector('#reports-markdown-rendered h1').textContent.trim() === 'Weekly Report 2026-W47' && document.getElementById('reports-markdown-rendered').textContent.includes('<img id=unsafe-report>') && !document.getElementById('unsafe-report')"));
                evaluate("document.getElementById('reports-markdown-source-toggle').click()");
                awaitScript("document.getElementById('reports-markdown-pre') && document.getElementById('reports-markdown-pre').textContent.includes('# Weekly Report 2026-W47')");
                assertEquals("true", evaluate("document.getElementById('reports-markdown-pre').textContent.includes('<img id=unsafe-report>') && !document.getElementById('unsafe-report')"));

                assertEquals("true", evaluate("window.handleBackNavigation()"));
                awaitScript("document.getElementById('page-title').textContent === '用量总览' && !document.getElementById('reports-view')");
                assertTrue(requests.stream().anyMatch(line -> line.startsWith("GET /api/reports?")));
                assertTrue(requests.stream().anyMatch(line -> line.startsWith("GET /api/reports/weekly/current?format=both")));
                assertTrue(requests.stream().allMatch(line -> line.startsWith("GET ")));
                assertFalse(authorizations.isEmpty());
                assertTrue(authorizations.stream().allMatch(value -> value.equals("Authorization: Bearer reports-test-secret")));
            } finally {
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void upstream94MultiAccountPresentationAlibabaAndExactTrend() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            if (header.startsWith("Authorization: ")) authorizations.add(header);
                        }
                        String body;
                        if (first.contains("/api/subscriptions ")) {
                            body = "{\"subscriptions\":[],\"updatedAt\":\"\"}";
                        } else if (first.contains("/api/sync/settings/limitAccountPresentation ")) {
                            body = "{\"ok\":true,\"version\":1,\"revision\":3,\"updatedAt\":\"2026-11-20T00:00:00Z\","
                                    + "\"value\":{\"deepseek\":{\"labels\":{\"sha256:ds-1\":\"工作 DeepSeek\",\"sha256:ds-2\":\"备用 DeepSeek\"},"
                                    + "\"order\":[\"sha256:ds-2\",\"sha256:ds-1\"]},"
                                    + "\"alibaba\":{\"labels\":{\"sha256:ali-1:cn-personal\":\"百炼主力\"},"
                                    + "\"order\":[\"sha256:ali-1:cn-personal\"]}}}";
                        } else {
                            org.json.JSONArray providers = new org.json.JSONArray()
                                    .put(new org.json.JSONObject().put("provider", "deepseek").put("accountKey", "sha256:ds-1")
                                            .put("source", "api").put("status", "ok")
                                            .put("windows", new org.json.JSONArray().put(new org.json.JSONObject()
                                                    .put("kind", "billing").put("metric", "credits").put("remaining", 68.4).put("currency", "CNY").put("showMeter", false)))
                                            .put("balance", new org.json.JSONObject().put("amount", 68.4).put("currency", "CNY")))
                                    .put(new org.json.JSONObject().put("provider", "alibaba").put("accountKey", "sha256:ali-1")
                                            .put("region", "cn-personal").put("source", "cli").put("status", "ok")
                                            .put("windows", new org.json.JSONArray().put(new org.json.JSONObject()
                                                    .put("kind", "session").put("label", "5h").put("usedPercent", 18))))
                                    .put(new org.json.JSONObject().put("provider", "deepseek").put("accountKey", "sha256:ds-2")
                                            .put("source", "api").put("status", "ok")
                                            .put("windows", new org.json.JSONArray().put(new org.json.JSONObject()
                                                    .put("kind", "billing").put("metric", "credits").put("remaining", 12.0).put("currency", "CNY").put("showMeter", false)))
                                            .put("balance", new org.json.JSONObject().put("amount", 12.0).put("currency", "CNY")));
                            body = new org.json.JSONObject(testStats(false))
                                    .put("syncSettingsRevisions", new org.json.JSONObject().put("limitAccountPresentation", 3))
                                    .put("limits", new org.json.JSONObject().put("providers", providers))
                                    .toString();
                        }
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException ignored) {
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-upstream94-hub");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'v94-test-secret', true)");
                awaitScript("document.querySelector('.trend-selection') && document.querySelector('.trend-selection').innerText.includes('1.23K')");

                evaluate("document.querySelector('[data-page=\"limits\"]').click()");
                awaitScript("document.querySelectorAll('[data-limit-account]').length === 3 && document.body.innerText.includes('备用 DeepSeek')");
                assertEquals("true", evaluate("(() => {"
                        + " const cards = Array.from(document.querySelectorAll('[data-limit-account]'));"
                        + " return cards.length === 3"
                        + " && cards[0].innerText.includes('备用 DeepSeek')"
                        + " && cards[1].innerText.includes('Alibaba Cloud') && cards[1].innerText.includes('中国站 · 个人版') && cards[1].innerText.includes('百炼主力')"
                        + " && cards[2].innerText.includes('工作 DeepSeek');"
                        + " })()"));

                evaluate("document.querySelector('[data-page=\"settings\"]').click()");
                awaitScript("document.getElementById('exact-trend-tokens')");
                evaluate("document.getElementById('exact-trend-tokens').click()");
                awaitScript("document.getElementById('exact-trend-tokens').checked === true");
                evaluate("document.querySelector('[data-page=\"overview\"]').click()");
                awaitScript("document.querySelector('.trend-selection') && document.querySelector('.trend-selection').innerText.includes('1,234')");

                assertTrue(requests.stream().anyMatch(line -> line.startsWith("GET /api/sync/settings/limitAccountPresentation ")));
                assertTrue(requests.stream().allMatch(line -> line.startsWith("GET ")));
                assertFalse(authorizations.isEmpty());
                assertTrue(authorizations.stream().allMatch(value -> value.equals("Authorization: Bearer v94-test-secret")));
            } finally {
                scenario.close();
                scenario = null;
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void antigravityManagerViewFetchesSnapshotRendersCardsFiltersAndResumesOnForeground() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        long nowSec = System.currentTimeMillis() / 1000L;
        String nowIso = java.time.Instant.now().toString();
        String inThreeHours = java.time.Instant.now().plusSeconds(3L * 3600L).toString();
        String inFourDays = java.time.Instant.now().plusSeconds(4L * 86400L).toString();
        String inSixDays = java.time.Instant.now().plusSeconds(6L * 86400L).toString();
        String agManagerPayload = new org.json.JSONObject()
                .put("ok", true)
                .put("updatedAt", nowIso)
                .put("devices", new org.json.JSONArray()
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "pc-1")
                                .put("hostname", "Main-PC")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject()
                                        .put("startupRefresh", false)
                                        .put("autoRefresh", true)
                                        .put("refreshIntervalMinutes", 15))
                                .put("activeAccounts", new org.json.JSONObject()
                                        .put("classic", "agm-1")
                                        .put("ide", "agm-1")
                                        .put("agy", "bob@example.com")
                                        .put("acp", org.json.JSONObject.NULL))
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "agm-1")
                                                .put("email", "alice@example.com")
                                                .put("name", "Alice Ultra")
                                                .put("subscriptionTier", "ULTRA")
                                                .put("hasDeviceProfile", true)
                                                .put("lastUsedAt", nowSec - 60)
                                                .put("refresh_token", "1//secret-rt")
                                                .put("accessToken", "ya29.secret-at")
                                                .put("quota", new org.json.JSONObject()
                                                        .put("lastUpdatedAt", nowSec)
                                                        .put("isForbidden", false)
                                                        .put("groups", new org.json.JSONArray()
                                                                .put(new org.json.JSONObject()
                                                                        .put("displayName", "Gemini")
                                                                        .put("secretToken", "must-strip-group")
                                                                        .put("buckets", new org.json.JSONArray()
                                                                                .put(new org.json.JSONObject()
                                                                                        .put("bucketId", "gemini-5h")
                                                                                        .put("window", "5h")
                                                                                        .put("remainingFraction", 0.92)
                                                                                        .put("resetTime", inThreeHours)
                                                                                        .put("displayName", "Gemini 5h"))
                                                                                .put(new org.json.JSONObject()
                                                                                        .put("bucketId", "gemini-weekly")
                                                                                        .put("window", "weekly")
                                                                                        .put("remainingFraction", 0.78)
                                                                                        .put("resetTime", inFourDays)
                                                                                        .put("displayName", "Gemini Weekly"))))
                                                                .put(new org.json.JSONObject()
                                                                        .put("displayName", "Claude / GPT")
                                                                        .put("buckets", new org.json.JSONArray()
                                                                                .put(new org.json.JSONObject()
                                                                                        .put("bucketId", "claude-5h")
                                                                                        .put("window", "5h")
                                                                                        .put("remainingFraction", 0.85)
                                                                                        .put("resetTime", inThreeHours)
                                                                                        .put("displayName", "Claude 5h"))
                                                                                .put(new org.json.JSONObject()
                                                                                        .put("bucketId", "claude-weekly")
                                                                                        .put("window", "weekly")
                                                                                        .put("remainingFraction", 0.64)
                                                                                        .put("resetTime", inFourDays)
                                                                                        .put("displayName", "Claude Weekly"))))
                                                                .put(new org.json.JSONObject()
                                                                        .put("displayName", "Hydrogen")
                                                                        .put("description", "Dedicated pool")
                                                                        .put("buckets", new org.json.JSONArray()
                                                                                .put(new org.json.JSONObject()
                                                                                        .put("bucketId", "hydrogen-weekly")
                                                                                        .put("window", "weekly")
                                                                                        .put("remainingFraction", 0.90)
                                                                                        .put("resetTime", inSixDays)
                                                                                        .put("displayName", "Hydrogen Weekly")))))
                                                        .put("models", new org.json.JSONArray()
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-4-hydrogen-preview")
                                                                        .put("displayName", "Gemini 4 Hydrogen")
                                                                        .put("percentage", 90)
                                                                        .put("resetTime", inSixDays))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "claude-sonnet-4-6-thinking")
                                                                        .put("displayName", "Claude Sonnet 4.6")
                                                                        .put("percentage", 85)
                                                                        .put("resetTime", inThreeHours))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gpt-oss-120b-medium")
                                                                        .put("displayName", "GPT OSS 120B")
                                                                        .put("percentage", 85)
                                                                        .put("resetTime", inThreeHours))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-3-pro-high")
                                                                        .put("displayName", "Gemini 3 Pro High")
                                                                        .put("percentage", 92)
                                                                        .put("resetTime", inThreeHours))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-3-flash")
                                                                        .put("displayName", "<img id=unsafe-agm-model>Gemini 3 Flash")
                                                                        .put("percentage", 100)
                                                                        .put("resetTime", inThreeHours)))))
                                        .put(new org.json.JSONObject()
                                                .put("id", "agm-2")
                                                .put("email", "bob@example.com")
                                                .put("name", "Bob Pro")
                                                .put("subscriptionTier", "PRO")
                                                .put("quota", new org.json.JSONObject()
                                                        .put("lastUpdatedAt", nowSec - 300)
                                                        .put("models", new org.json.JSONArray()
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "claude-opus-4-6-thinking")
                                                                        .put("displayName", "Claude Opus 4.6")
                                                                        .put("percentage", 15)
                                                                        .put("resetTime", inThreeHours))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-3-pro-high")
                                                                        .put("displayName", "Gemini 3 Pro High")
                                                                        .put("percentage", 48)
                                                                        .put("resetTime", inThreeHours))
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-3-flash")
                                                                        .put("displayName", "Gemini 3 Flash")
                                                                        .put("percentage", 82)
                                                                        .put("resetTime", inThreeHours)))))
                                        .put(new org.json.JSONObject()
                                                .put("id", "agm-3")
                                                .put("email", "carol@example.com")
                                                .put("subscriptionTier", "FREE")
                                                .put("validationBlocked", true)
                                                .put("validationMessage", "<img id=unsafe-agm-err>Verify required")
                                                .put("quota", org.json.JSONObject.NULL))))
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "pc-2")
                                .put("hostname", "Backup-PC")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject()
                                        .put("startupRefresh", false)
                                        .put("autoRefresh", false)
                                        .put("refreshIntervalMinutes", 10))
                                .put("activeAccounts", new org.json.JSONObject())
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "agm-4")
                                                .put("email", "dave@example.com")
                                                .put("subscriptionTier", "FREE")
                                                .put("banned", true)
                                                .put("quota", new org.json.JSONObject()
                                                        .put("groups", new org.json.JSONArray())
                                                        .put("models", new org.json.JSONArray()))))))
                .toString();

        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            if (header.startsWith("Authorization: ")) authorizations.add(header);
                        }
                        if (first.contains("/api/sync/settings/limitAccountPresentation ")) {
                            byte[] errPayload = "{\"error\":\"not_found\"}".getBytes(StandardCharsets.UTF_8);
                            socket.getOutputStream().write(("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: "
                                    + errPayload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                            socket.getOutputStream().write(errPayload);
                            continue;
                        }
                        String body;
                        if (first.contains("/api/subscriptions ")) {
                            body = "{\"subscriptions\":[],\"updatedAt\":\"\"}";
                        } else if (first.contains("/api/antigravity-manager ")) {
                            body = agManagerPayload;
                        } else {
                            body = testStats(false);
                        }
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException ignored) {
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-ag-manager-hub");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'agm-test-secret', true)");
                awaitScript("document.querySelector('.token-total')");

                evaluate("document.querySelector('[data-page=\"limits\"]').click()");
                awaitScript("document.getElementById('filters') && document.querySelector('[data-quota=\"antigravityManager\"]')");
                evaluate("document.querySelector('[data-quota=\"antigravityManager\"]').click()");
                awaitScript("document.getElementById('ag-manager-view') && document.querySelectorAll('[data-agm-account]').length === 3");

                assertEquals("true", evaluate("!document.getElementById('filters')"));
                assertEquals("true", evaluate("(() => {"
                        + " const view = document.getElementById('ag-manager-view');"
                        + " const text = view ? view.innerText : '';"
                        + " return text.includes('自动刷新 15m') && text.includes('总计') && text.includes('Ultra') && text.includes('Pro') && text.includes('Free') && text.includes('异常');"
                        + " })()"));

                // Verify agm-1 active styling, localized slots, tier, fingerprint, capabilities, timestamp, and 5 cells.
                assertEquals("true", evaluate("(() => {"
                        + " const card = document.querySelector('[data-agm-account=\"agm-1\"]');"
                        + " if (!card) return false;"
                        + " const email = card.querySelector('[data-selectable=\"true\"]');"
                        + " const text = card.innerText;"
                        + " const bars = card.querySelectorAll('[role=\"progressbar\"]');"
                        + " const fifthWrap = bars[4] ? bars[4].parentElement : null;"
                        + " return Boolean(email) && email.className.includes('text-sky-300')"
                        + " && text.includes('经典款') && text.includes('IDE') && text.includes('◆ ULTRA') && text.includes('独立指纹')"
                        + " && text.includes('Hydrogen') && text.includes('Claude 4.6') && text.includes('GPT-120B')"
                        + " && /\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}/.test(text)"
                        + " && bars.length === 5 && Boolean(fifthWrap) && fifthWrap.className.includes('col-span-2') && fifthWrap.innerText.includes('Hydrogen · weekly');"
                        + " })()"));

                // Verify agm-2 models-only fallback grid (3 cells, odd 3rd cell spans full width).
                assertEquals("true", evaluate("(() => {"
                        + " const card = document.querySelector('[data-agm-account=\"agm-2\"]');"
                        + " if (!card) return false;"
                        + " const text = card.innerText;"
                        + " const bars = card.querySelectorAll('[role=\"progressbar\"]');"
                        + " const thirdWrap = bars[2] ? bars[2].parentElement : null;"
                        + " return text.includes('AGY') && text.includes('◆ PRO') && bars.length === 3"
                        + " && text.includes('Gemini Pro') && text.includes('Claude / GPT') && text.includes('Gemini Flash')"
                        + " && Boolean(thirdWrap) && thirdWrap.className.includes('col-span-2');"
                        + " })()"));

                // Verify agm-3 abnormal badge, escaped error note, empty quota fallback, and zero secret leaks.
                assertEquals("true", evaluate("(() => {"
                        + " const card = document.querySelector('[data-agm-account=\"agm-3\"]');"
                        + " const bodyText = document.body.innerText;"
                        + " return Boolean(card)"
                        + " && card.innerText.includes('待验证') && card.innerText.includes('FREE') && card.innerText.includes('暂无模型额度快照')"
                        + " && card.innerText.includes('<img id=unsafe-agm-err>Verify required')"
                        + " && !document.getElementById('unsafe-agm-err') && !document.getElementById('unsafe-agm-model')"
                        + " && !bodyText.includes('1//secret-rt') && !bodyText.includes('ya29.secret-at') && !bodyText.includes('must-strip-group');"
                        + " })()"));

                // Verify expand & collapse models list on agm-1 + XSS escaping on model displayName.
                evaluate("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-expanded=\"false\"]').click()");
                awaitScript("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-expanded=\"true\"]').innerText.includes('收起模型 (5)')");
                assertEquals("true", evaluate("document.querySelector('[data-agm-account=\"agm-1\"]').innerText.includes('<img id=unsafe-agm-model>Gemini 3 Flash') && !document.getElementById('unsafe-agm-model')"));
                evaluate("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-expanded=\"true\"]').click()");
                awaitScript("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-expanded=\"false\"]').innerText.includes('展开模型 (5)')");

                // Verify email copy button feedback & actual Android ClipboardManager content.
                scenario.onActivity(activity -> {
                    android.content.ClipboardManager cm = activity.getSystemService(android.content.ClipboardManager.class);
                    if (cm != null) cm.setPrimaryClip(android.content.ClipData.newPlainText("clear", ""));
                });
                evaluate("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-label*=\"复制邮箱\"]').click()");
                awaitScript("(() => {"
                        + " const btn = document.querySelector('[data-agm-account=\"agm-1\"] button[aria-label*=\"alice@example.com\"]');"
                        + " return Boolean(btn) && (btn.innerText.includes('已复制') || btn.innerText.includes('复制失败'));"
                        + " })()");
                AtomicReference<String> copyBtnText = new AtomicReference<>(evaluate("document.querySelector('[data-agm-account=\"agm-1\"] button[aria-label*=\"alice@example.com\"]').innerText"));
                AtomicReference<String> clipboardText = new AtomicReference<>("");
                scenario.onActivity(activity -> {
                    android.content.ClipboardManager cm = activity.getSystemService(android.content.ClipboardManager.class);
                    if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip().getItemCount() > 0) {
                        CharSequence seq = cm.getPrimaryClip().getItemAt(0).getText();
                        if (seq != null) clipboardText.set(seq.toString());
                    }
                });
                assertTrue("Expected copy button to succeed with 已复制 and write clipboard, but btn=" + copyBtnText.get() + " clipboard=" + clipboardText.get(),
                        copyBtnText.get().contains("已复制") && "alice@example.com".equals(clipboardText.get()));

                // Verify status, tier, search, and device filters.
                evaluate("Array.from(document.querySelectorAll('[aria-label=\"按状态筛选\"] button')).find(b => b.innerText.includes('异常')).click()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 1 && Boolean(document.querySelector('[data-agm-account=\"agm-3\"]'))");
                evaluate("Array.from(document.querySelectorAll('[aria-label=\"按状态筛选\"] button')).find(b => b.innerText.includes('全部')).click()");
                evaluate("Array.from(document.querySelectorAll('[aria-label=\"按套餐筛选\"] button')).find(b => b.innerText.trim() === 'PRO').click()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 1 && Boolean(document.querySelector('[data-agm-account=\"agm-2\"]'))");
                evaluate("Array.from(document.querySelectorAll('[aria-label=\"按套餐筛选\"] button')).find(b => b.innerText.trim() === '全套餐').click()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 3");

                evaluate("(() => {"
                        + " const input = document.getElementById('ag-manager-search');"
                        + " const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
                        + " setter.call(input, 'hydrogen');"
                        + " input.dispatchEvent(new Event('input', { bubbles: true }));"
                        + " })()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 1 && Boolean(document.querySelector('[data-agm-account=\"agm-1\"]'))");

                evaluate("(() => {"
                        + " const input = document.getElementById('ag-manager-search');"
                        + " const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
                        + " setter.call(input, 'no-such-account-xyz');"
                        + " input.dispatchEvent(new Event('input', { bubbles: true }));"
                        + " })()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 0 && document.getElementById('ag-manager-view').innerText.includes('无匹配账号')");

                evaluate("(() => {"
                        + " const input = document.getElementById('ag-manager-search');"
                        + " const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
                        + " setter.call(input, '');"
                        + " input.dispatchEvent(new Event('input', { bubbles: true }));"
                        + " })()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 3");

                evaluate("Array.from(document.querySelectorAll('#ag-manager-devices button')).find(b => b.innerText.includes('Backup-PC')).click()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 1 && document.querySelector('[data-agm-account=\"agm-4\"]').innerText.includes('已封禁')");
                evaluate("Array.from(document.querySelectorAll('#ag-manager-devices button')).find(b => b.innerText.includes('Main-PC')).click()");
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 3");

                // Verify mobile viewport width & no card horizontal overflow.
                assertEquals("true", evaluate("(() => {"
                        + " if (document.documentElement.scrollWidth > window.innerWidth + 1) return false;"
                        + " return Array.from(document.querySelectorAll('[data-agm-account]')).every(card => {"
                        + "   const r = card.getBoundingClientRect();"
                        + "   return r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1;"
                        + " });"
                        + " })()"));

                // Verify manual refresh triggers an additional GET /api/antigravity-manager.
                long countBeforeManual = requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count();
                evaluate("document.getElementById('ag-manager-refresh').click()");
                long deadline = System.currentTimeMillis() + 20_000;
                while (requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count() <= countBeforeManual
                        && System.currentTimeMillis() < deadline) {
                    Thread.sleep(100);
                }
                long countAfterManual = requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count();
                assertTrue("Manual refresh must re-query /api/antigravity-manager", countAfterManual > countBeforeManual);

                // Verify background -> foreground lifecycle recovery re-queries /api/antigravity-manager.
                long countBeforeBg = countAfterManual;
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                Thread.sleep(200);
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                deadline = System.currentTimeMillis() + 20_000;
                while (requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count() <= countBeforeBg
                        && System.currentTimeMillis() < deadline) {
                    Thread.sleep(100);
                }
                assertTrue("Returning to foreground on AG pool tab must re-query /api/antigravity-manager",
                        requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count() > countBeforeBg);
                awaitScript("document.querySelectorAll('[data-agm-account]').length === 3");

                // Verify switching back to 账户额度 restores global #filters bar.
                evaluate("document.querySelector('[data-quota=\"limits\"]').click()");
                awaitScript("Boolean(document.getElementById('filters'))");

                assertTrue(requests.contains("GET /api/antigravity-manager HTTP/1.1"));
                assertTrue(requests.stream().allMatch(line -> line.startsWith("GET ")));
                assertFalse(authorizations.isEmpty());
                assertTrue(authorizations.stream().allMatch(value -> value.equals("Authorization: Bearer agm-test-secret")));

                evaluate("window.HubNative.disconnect()");
                awaitConnectionPage();
            } finally {
                if (scenario != null) {
                    scenario.close();
                    scenario = null;
                }
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void antigravityManagerMultiDeviceSwitcherStaysBoundedAndSwitchesCleanly() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        String nowIso = java.time.Instant.now().toString();
        String inTwoHours = java.time.Instant.now().plusSeconds(7200L).toString();
        String agManagerPayload = new org.json.JSONObject()
                .put("ok", true)
                .put("updatedAt", nowIso)
                .put("devices", new org.json.JSONArray()
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "dev-debian")
                                .put("hostname", "debian")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject().put("autoRefresh", true).put("refreshIntervalMinutes", 10))
                                .put("activeAccounts", new org.json.JSONObject().put("classic", "shared-acc-1"))
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "shared-acc-1")
                                                .put("email", "first-host@example.com")
                                                .put("subscriptionTier", "ULTRA")
                                                .put("quota", new org.json.JSONObject()
                                                        .put("models", new org.json.JSONArray()
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "gemini-3-pro")
                                                                        .put("displayName", "Gemini 3 Pro")
                                                                        .put("percentage", 90)
                                                                        .put("resetTime", inTwoHours)))))))
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "pc-ir5n5uq")
                                .put("hostname", "DESKTOP-IR5N5UQ")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject().put("autoRefresh", true).put("refreshIntervalMinutes", 15))
                                .put("activeAccounts", new org.json.JSONObject().put("ide", "shared-acc-1"))
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "shared-acc-1")
                                                .put("email", "second-host@example.com")
                                                .put("subscriptionTier", "PRO")
                                                .put("quota", new org.json.JSONObject()
                                                        .put("models", new org.json.JSONArray()
                                                                .put(new org.json.JSONObject()
                                                                        .put("name", "claude-sonnet-4-6")
                                                                        .put("displayName", "Claude Sonnet 4.6")
                                                                        .put("percentage", 80)
                                                                        .put("resetTime", inTwoHours)))))))
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "pc-uuo5f81")
                                .put("hostname", "DESKTOP-UUO5F81")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject().put("autoRefresh", false).put("refreshIntervalMinutes", 10))
                                .put("activeAccounts", new org.json.JSONObject())
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "uuo-1")
                                                .put("email", "third-host@example.com")
                                                .put("subscriptionTier", "FREE")
                                                .put("quota", new org.json.JSONObject().put("models", new org.json.JSONArray())))))
                        .put(new org.json.JSONObject()
                                .put("version", 1)
                                .put("deviceId", "pc-fourth")
                                .put("hostname", "DESKTOP-998877A")
                                .put("updatedAt", nowIso)
                                .put("settings", new org.json.JSONObject().put("autoRefresh", false).put("refreshIntervalMinutes", 10))
                                .put("activeAccounts", new org.json.JSONObject())
                                .put("accounts", new org.json.JSONArray()
                                        .put(new org.json.JSONObject()
                                                .put("id", "fourth-1")
                                                .put("email", "fourth-host@example.com")
                                                .put("subscriptionTier", "PRO")
                                                .put("quota", new org.json.JSONObject().put("models", new org.json.JSONArray()))))))
                .toString();

        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        requests.add(first);
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            // consume headers
                        }
                        String body;
                        if (first.contains("/api/subscriptions ")) {
                            body = "{\"subscriptions\":[],\"updatedAt\":\"\"}";
                        } else if (first.contains("/api/antigravity-manager ")) {
                            body = agManagerPayload;
                        } else {
                            body = testStats(false);
                        }
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException ignored) {
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-ag-manager-multidevice");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'agm-multi-secret', true)");
                awaitScript("document.querySelector('.token-total')");

                evaluate("document.querySelector('[data-page=\"limits\"]').click()");
                awaitScript("document.querySelector('[data-quota=\"antigravityManager\"]')");
                evaluate("document.querySelector('[data-quota=\"antigravityManager\"]').click()");
                awaitScript("document.querySelectorAll('#ag-manager-devices button').length === 4 && Boolean(document.querySelector('[data-agm-account=\"shared-acc-1\"]'))");

                // Host rail must stay bounded inside viewport while scrolling horizontally across 4 long hostnames.
                assertEquals("true", evaluate("(() => {"
                        + " const rail = document.getElementById('ag-manager-devices');"
                        + " if (!rail) return false;"
                        + " const r = rail.getBoundingClientRect();"
                        + " return document.documentElement.scrollWidth <= window.innerWidth + 1"
                        + "   && r.left >= -1 && r.right <= window.innerWidth + 1"
                        + "   && rail.scrollWidth > rail.clientWidth;"
                        + " })()"));

                // Expand models on Host 1 before switching devices.
                evaluate("document.querySelector('[data-agm-account=\"shared-acc-1\"] button[aria-expanded=\"false\"]').click()");
                awaitScript("document.querySelector('[data-agm-account=\"shared-acc-1\"] button[aria-expanded=\"true\"]')");

                // Clicking the 4th host button inside the scrollable rail switches cleanly.
                evaluate("Array.from(document.querySelectorAll('#ag-manager-devices button')).find(b => b.innerText.includes('DESKTOP-998877A')).click()");
                awaitScript("document.body.innerText.includes('fourth-host@example.com')");

                // Switching via bottom-sheet picker to Host 2 resets card expand state for same account.id.
                evaluate("document.getElementById('ag-manager-device-picker-trigger').click()");
                awaitScript("Boolean(document.querySelector('#ag-device-picker-dialog[open]'))");
                evaluate("document.querySelector('[data-agm-picker-device=\"pc-ir5n5uq\"]').click()");
                awaitScript("!document.querySelector('#ag-device-picker-dialog[open]') && document.body.innerText.includes('second-host@example.com')");
                assertEquals("true", evaluate("document.querySelector('[data-agm-account=\"shared-acc-1\"] button[aria-expanded]').getAttribute('aria-expanded') === 'false'"));

                // Android Back navigation dismisses the AG device picker dialog.
                evaluate("document.getElementById('ag-manager-device-picker-trigger').click()");
                awaitScript("Boolean(document.querySelector('#ag-device-picker-dialog[open]'))");
                assertEquals("true", evaluate("Boolean(window.handleBackNavigation())"));
                awaitScript("!document.querySelector('#ag-device-picker-dialog[open]')");

                // Top-header #refresh button refreshes AG pool when on AG tab.
                long agRequestsBefore = requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count();
                evaluate("document.getElementById('refresh').click()");
                long deadline = System.currentTimeMillis() + 20_000;
                while (requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count() <= agRequestsBefore
                        && System.currentTimeMillis() < deadline) {
                    Thread.sleep(100);
                }
                assertTrue("Top header refresh on AG pool tab must re-query /api/antigravity-manager",
                        requests.stream().filter(line -> line.startsWith("GET /api/antigravity-manager ")).count() > agRequestsBefore);

                evaluate("window.HubNative.disconnect()");
                awaitConnectionPage();
            } finally {
                if (scenario != null) {
                    scenario.close();
                    scenario = null;
                }
                server.close();
                responder.join(5000);
            }
        }
    }

    @Test public void antigravityManagerDegradesOn404UnauthorizedAndOversizedResponses() throws Exception {
        awaitConnectionPage();
        AtomicInteger agMode = new AtomicInteger(0);
        StringBuilder bigPadding = new StringBuilder(540 * 1024);
        for (int i = 0; i < 540 * 1024; i++) bigPadding.append('a');
        byte[] oversizedBody = ("{\"ok\":true,\"devices\":[{\"deviceId\":\"big\",\"hostname\":\"" + bigPadding + "\",\"accounts\":[]}]}")
                .getBytes(StandardCharsets.UTF_8);

        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            Thread responder = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        socket.setSoTimeout(5000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String first = reader.readLine();
                        if (first == null) continue;
                        String header;
                        while ((header = reader.readLine()) != null && !header.isEmpty()) {
                            // consume headers
                        }
                        if (first.contains("/api/antigravity-manager ")) {
                            int mode = agMode.get();
                            if (mode == 0) {
                                byte[] err = "{\"error\":\"not_found\"}".getBytes(StandardCharsets.UTF_8);
                                socket.getOutputStream().write(("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: "
                                        + err.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                                socket.getOutputStream().write(err);
                            } else if (mode == 1) {
                                byte[] err = "{\"error\":\"unauthorized\"}".getBytes(StandardCharsets.UTF_8);
                                socket.getOutputStream().write(("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: "
                                        + err.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                                socket.getOutputStream().write(err);
                            } else {
                                try {
                                    socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                            + oversizedBody.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                                    socket.getOutputStream().write(oversizedBody);
                                } catch (java.io.IOException ignoredClientAbort) {
                                    // HubClient aborts once > 512 KiB is read.
                                }
                            }
                            continue;
                        }
                        String body = first.contains("/api/subscriptions ")
                                ? "{\"subscriptions\":[],\"updatedAt\":\"\"}"
                                : testStats(false);
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
                    } catch (java.net.SocketException ignored) {
                    } catch (Exception error) {
                        if (!server.isClosed()) throw new RuntimeException(error);
                    }
                }
            }, "test-ag-manager-errors");
            responder.setDaemon(true);
            responder.start();
            try {
                evaluate("window.HubNative.connect('http://127.0.0.1:" + server.getLocalPort() + "', 'agm-err-secret', true)");
                awaitScript("document.querySelector('.token-total')");

                // Mode 0: HTTP 404 -> unsupported_hub degradation
                evaluate("document.querySelector('[data-page=\"limits\"]').click()");
                awaitScript("document.querySelector('[data-quota=\"antigravityManager\"]')");
                evaluate("document.querySelector('[data-quota=\"antigravityManager\"]').click()");
                awaitScript("document.getElementById('ag-manager-view') && document.getElementById('ag-manager-view').innerText.includes('Hub 版本较旧或未启用 Antigravity 账号池同步')");

                // Mode 1: HTTP 401 -> unauthorized degradation
                agMode.set(1);
                evaluate("document.getElementById('ag-manager-refresh').click()");
                awaitScript("document.getElementById('ag-manager-view').innerText.includes('认证失败，请检查 Hub secret')");

                // Mode 2: >512 KiB -> response size guard
                agMode.set(2);
                evaluate("document.getElementById('ag-manager-refresh').click()");
                awaitScript("document.getElementById('ag-manager-view').innerText.includes('Hub 响应超过大小限制')");
            } finally {
                if (scenario != null) {
                    scenario.close();
                    scenario = null;
                }
                server.close();
                responder.join(5000);
            }
        }
    }

    private void awaitPersistedTheme(String expectedTheme) throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        long deadline = android.os.SystemClock.elapsedRealtime() + WEBVIEW_TIMEOUT_MS;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            if (expectedTheme.equals(DisplayPrefs.theme(context))) return;
            Thread.sleep(50);
        }
        assertEquals("Expected persisted display-prefs theme", expectedTheme, DisplayPrefs.theme(context));
    }

    private int currentViewportBackgroundColor() {
        AtomicInteger color = new AtomicInteger(0);
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            assertNotNull("Activity must contain its WebView", view);
            View parent = (View) view.getParent();
            assertNotNull("WebView must have a viewport container", parent);
            assertTrue("Viewport background must be a ColorDrawable",
                    parent.getBackground() instanceof android.graphics.drawable.ColorDrawable);
            color.set(((android.graphics.drawable.ColorDrawable) parent.getBackground()).getColor());
        });
        return color.get();
    }

    @Test public void themeSelectionUpdatesDocumentChromeAndPersistsAcrossColdRestart() throws Exception {
        awaitConnectionPage();
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

        // 1. Default startup uses obsidian dark chrome and document tokens.
        awaitScript("document.documentElement.dataset.theme === 'obsidian' && document.documentElement.dataset.colorMode === 'dark'");
        assertEquals("true", evaluate("getComputedStyle(document.body).backgroundColor === 'rgb(9, 12, 16)'"));
        assertEquals("true", evaluate("JSON.parse(window.HubNative.initialDisplayPrefs()).theme === 'obsidian'"));
        assertEquals(ThemePolicy.OBSIDIAN.canvasColor, currentViewportBackgroundColor());

        // 2. Switch to daylight light theme and verify live document + native chrome + persistence across cold restart.
        evaluate("(() => {"
                + " const btn = document.querySelector('[data-theme-option=\"daylight\"], [data-theme-card=\"daylight\"], button[data-theme=\"daylight\"]');"
                + " if (btn) { btn.click(); return; }"
                + " window.HubNative.saveDisplayPrefs(JSON.stringify({ separateQoderClients: false, exactTrendTokens: false, theme: 'daylight' }));"
                + " window.receiveNative({ type: 'displayPrefs', separateQoderClients: false, exactTrendTokens: false, theme: 'daylight', systemDark: false });"
                + "})()");
        awaitScript("document.documentElement.dataset.theme === 'daylight' && document.documentElement.dataset.colorMode === 'light'"
                + " && getComputedStyle(document.body).backgroundColor === 'rgb(244, 246, 249)'");
        awaitPersistedTheme(ThemePolicy.THEME_DAYLIGHT);
        assertEquals(ThemePolicy.DAYLIGHT.canvasColor, currentViewportBackgroundColor());

        scenario.close();
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitConnectionPage();
        awaitScript("document.documentElement.dataset.theme === 'daylight' && document.documentElement.dataset.colorMode === 'light'");
        assertEquals("true", evaluate("getComputedStyle(document.body).backgroundColor === 'rgb(244, 246, 249)'"));
        assertEquals("true", evaluate("JSON.parse(window.HubNative.initialDisplayPrefs()).theme === 'daylight'"));
        assertEquals(ThemePolicy.DAYLIGHT.canvasColor, currentViewportBackgroundColor());

        // 3. Switch to amber dark theme and verify live update + persistence across cold restart.
        evaluate("(() => {"
                + " const btn = document.querySelector('[data-theme-option=\"amber\"], [data-theme-card=\"amber\"], button[data-theme=\"amber\"]');"
                + " if (btn) { btn.click(); return; }"
                + " window.HubNative.saveDisplayPrefs(JSON.stringify({ separateQoderClients: false, exactTrendTokens: false, theme: 'amber' }));"
                + " window.receiveNative({ type: 'displayPrefs', separateQoderClients: false, exactTrendTokens: false, theme: 'amber', systemDark: true });"
                + "})()");
        awaitScript("document.documentElement.dataset.theme === 'amber' && document.documentElement.dataset.colorMode === 'dark'"
                + " && getComputedStyle(document.body).backgroundColor === 'rgb(13, 11, 9)'");
        awaitPersistedTheme(ThemePolicy.THEME_AMBER);
        assertEquals(ThemePolicy.AMBER.canvasColor, currentViewportBackgroundColor());

        scenario.close();
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitConnectionPage();
        awaitScript("document.documentElement.dataset.theme === 'amber' && document.documentElement.dataset.colorMode === 'dark'");
        assertEquals("true", evaluate("getComputedStyle(document.body).backgroundColor === 'rgb(13, 11, 9)'"));
        assertEquals(ThemePolicy.AMBER.canvasColor, currentViewportBackgroundColor());

        // 4. Switch to auto mode and verify systemDark resolution persists across cold restart.
        evaluate("(() => {"
                + " const toggle = document.getElementById('theme-auto');"
                + " if (toggle && !toggle.checked) { toggle.click(); return; }"
                + " const initial = JSON.parse(window.HubNative.initialDisplayPrefs());"
                + " window.HubNative.saveDisplayPrefs(JSON.stringify({ separateQoderClients: false, exactTrendTokens: false, theme: 'auto' }));"
                + " window.receiveNative({ type: 'displayPrefs', separateQoderClients: false, exactTrendTokens: false, theme: 'auto', systemDark: Boolean(initial.systemDark) });"
                + "})()");
        awaitPersistedTheme(ThemePolicy.THEME_AUTO);

        scenario.close();
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitConnectionPage();
        boolean systemDark = (context.getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        ThemePolicy.Spec expectedAuto = ThemePolicy.resolve(ThemePolicy.THEME_AUTO, systemDark);
        String expectedRgb = expectedAuto.isLight ? "rgb(244, 246, 249)" : "rgb(9, 12, 16)";
        awaitScript("document.documentElement.dataset.theme === '" + expectedAuto.id
                + "' && document.documentElement.dataset.colorMode === '" + (expectedAuto.isLight ? "light" : "dark") + "'");
        assertEquals("true", evaluate("getComputedStyle(document.body).backgroundColor === '" + expectedRgb + "'"));
        assertEquals("true", evaluate("JSON.parse(window.HubNative.initialDisplayPrefs()).theme === 'auto'"
                + " && JSON.parse(window.HubNative.initialDisplayPrefs()).systemDark === " + systemDark));
        assertEquals(expectedAuto.canvasColor, currentViewportBackgroundColor());

        // 5. Legacy DisplayPrefs JSON lacking theme falls back safely to obsidian without dropping other flags.
        scenario.close();
        context.getSharedPreferences("display-prefs", 0).edit()
                .putString("prefs", "{\"separateQoderClients\":true,\"exactTrendTokens\":true}")
                .commit();
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitConnectionPage();
        awaitScript("document.documentElement.dataset.theme === 'obsidian' && document.documentElement.dataset.colorMode === 'dark'");
        assertEquals("true", evaluate("(() => {"
                + " const init = JSON.parse(window.HubNative.initialDisplayPrefs());"
                + " return init.theme === 'obsidian' && init.separateQoderClients === true && init.exactTrendTokens === true;"
                + "})()"));
        assertEquals(ThemePolicy.OBSIDIAN.canvasColor, currentViewportBackgroundColor());
    }

    private static String testStats(boolean completed) throws Exception {
        String now = java.time.Instant.now().toString();
        org.json.JSONObject session = new org.json.JSONObject()
                .put("client", "codex").put("sessionId", "test").put("totalTokens", 1234)
                .put("lastUsedAt", now).put("turnEnded", completed)
                .put("liveActivity", new org.json.JSONObject().put("state", completed ? "idle" : "running").put("observedAt", now));
        org.json.JSONObject today = new org.json.JSONObject().put("totalTokens", 1234).put("costUsd", 1.25)
                .put("sessions", new org.json.JSONObject().put("codex:test", session));
        org.json.JSONObject periods = new org.json.JSONObject().put("today", today);
        org.json.JSONObject device = new org.json.JSONObject().put("deviceId", "test-pc")
                .put("updatedAt", now).put("stale", false).put("periods", periods);
        return new org.json.JSONObject().put("devices", new org.json.JSONArray().put(device))
                .put("periods", periods).put("subscriptionsUpdatedAt", "")
                .put("historyPreview", new org.json.JSONObject().put("daily", new org.json.JSONArray().put(
                        new org.json.JSONObject().put("date", now.substring(0, 10)).put("tokens", 1234).put("cost", 1.25))))
                .toString();
    }
}
