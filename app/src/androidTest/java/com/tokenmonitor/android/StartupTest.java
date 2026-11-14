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
