package com.tokenmonitor.android;

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
    private ActivityScenario<MainActivity> scenario;

    @Before public void launchFreshViewer() {
        SessionMonitorService.stop(InstrumentationRegistry.getInstrumentation().getTargetContext(), "测试重置", true);
        clearConnection();
        scenario = ActivityScenario.launch(MainActivity.class);
    }

    @After public void closeViewer() {
        SessionMonitorService.stop(InstrumentationRegistry.getInstrumentation().getTargetContext(), "测试结束", true);
        if (scenario != null) scenario.close();
        clearConnection();
    }

    private void clearConnection() {
        InstrumentationRegistry.getInstrumentation().getTargetContext()
                .getSharedPreferences("hub-connection", 0).edit().clear().commit();
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
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch callback = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView view = web(activity.getWindow().getDecorView());
            assertNotNull("Activity must contain its WebView", view);
            view.evaluateJavascript(script, value -> { result.set(value); callback.countDown(); });
        });
        assertTrue("WebView JS callback timed out", callback.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitScript(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        String last;
        do {
            last = evaluate("Boolean(" + expression + ")");
            if ("true".equals(last)) return;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        fail("WebView did not reach expected state: " + expression + "; result=" + last);
    }

    private void awaitConnectionPage() throws Exception {
        awaitScript("typeof window.receiveNative === 'function' && document.getElementById('settings') && !document.getElementById('settings').hidden");
    }

    @Test public void packagedPageLoadsCssScriptsAndNativeReadyCallback() throws Exception {
        awaitConnectionPage();
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

    private void publishStats(org.json.JSONObject stats) throws Exception {
        String snapshot = new org.json.JSONObject().put("type", "stats").put("data", stats)
                .put("fetchedAt", System.currentTimeMillis()).toString();
        evaluate("window.receiveNative(" + org.json.JSONObject.quote(snapshot) + ")");
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

    @Test public void nativeBridgeConnectsAndDisplaysAuthenticatedHubStats() throws Exception {
        awaitConnectionPage();
        List<String> requests = Collections.synchronizedList(new ArrayList<>());
        List<String> authorizations = Collections.synchronizedList(new ArrayList<>());
        java.util.concurrent.atomic.AtomicBoolean completed = new java.util.concurrent.atomic.AtomicBoolean();
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
                        String body = first.contains("/api/subscriptions ")
                                ? "{\"subscriptions\":[],\"updatedAt\":\"\"}"
                                : testStats(completed.get());
                        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + payload.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(payload);
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
                completed.set(true);
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
                completion.getNotification().contentIntent.send();
                awaitScript("document.getElementById('page-title').textContent === '会话详情' && document.body.innerText.includes('codex:test')");
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
