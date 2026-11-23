package com.tokenmonitor.android;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import static org.junit.Assert.*;

/** Native Android TLS instrumentation tests against real loopback SSLServerSockets and WebView bridge. */
@RunWith(AndroidJUnit4.class)
public final class HubTlsInstrumentationTest {
    private static final long WEBVIEW_TIMEOUT_MS = 20_000;
    private static final String TEST_SECRET = "tls-test-secret-01";
    private Context context;

    @Before public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SessionMonitorService.stop(context, "测试重置", true);
        clearAppState();
    }

    @After public void tearDown() {
        SessionMonitorService.stop(context, "测试结束", true);
        clearAppState();
    }

    private void clearAppState() {
        context.getSharedPreferences("hub-connection", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("limits-prefs", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("app-updates", Context.MODE_PRIVATE).edit().clear()
                .putBoolean("automatic", false).commit();
    }

    private static SSLServerSocket startTlsHub(TestCertFactory.Identity serverId, String expectedSecret, String statsJson) throws Exception {
        SSLServerSocket server = (SSLServerSocket) serverId.serverSslContext().getServerSocketFactory()
                .createServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        server.setEnabledProtocols(CertificateTrustPolicy.Tls12PlusSocketFactory
                .filterProtocols(server.getSupportedProtocols()));
        Thread thread = new Thread(() -> {
            while (!server.isClosed()) {
                try (SSLSocket socket = (SSLSocket) server.accept()) {
                    socket.setSoTimeout(5000);
                    socket.startHandshake();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    String requestLine = reader.readLine();
                    if (requestLine == null) continue;
                    String auth = "";
                    String line;
                    while ((line = reader.readLine()) != null && !line.isEmpty()) {
                        if (line.regionMatches(true, 0, "Authorization:", 0, 14)) {
                            auth = line.substring(14).trim();
                        }
                    }
                    String status;
                    String body;
                    if (!("Bearer " + expectedSecret).equals(auth)) {
                        status = "401 Unauthorized";
                        body = "{\"error\":\"unauthorized\"}";
                    } else if (requestLine.startsWith("GET /api/stats")) {
                        status = "200 OK";
                        body = statsJson;
                    } else if (requestLine.startsWith("GET /api/subscriptions")) {
                        status = "200 OK";
                        body = "{\"subscriptions\":[]}";
                    } else if (requestLine.startsWith("GET /api/sync/settings/limitAccountPresentation")) {
                        status = "404 Not Found";
                        body = "{\"error\":\"not found\"}";
                    } else {
                        status = "404 Not Found";
                        body = "{\"error\":\"not found\"}";
                    }
                    byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                    String header = "HTTP/1.1 " + status + "\r\nContent-Type: application/json\r\nContent-Length: "
                            + payload.length + "\r\nConnection: close\r\n\r\n";
                    OutputStream out = socket.getOutputStream();
                    out.write(header.getBytes(StandardCharsets.US_ASCII));
                    out.write(payload);
                    out.flush();
                } catch (IOException ignored) {
                    // Expected on rejected handshakes or shutdown.
                }
            }
        }, "android-tls-test-hub");
        thread.setDaemon(true);
        thread.start();
        return server;
    }

    @Test public void hubClientEnforcesScopedCustomCaSelfSignedPinningAndHostnameVerification() throws Exception {
        TestCertFactory.Identity caA = TestCertFactory.createCa("Android Test CA A");
        TestCertFactory.Identity caB = TestCertFactory.createCa("Android Test CA B");
        TestCertFactory.Identity serverA = TestCertFactory.createServerLeaf("127.0.0.1", caA, "127.0.0.1", "localhost");
        TestCertFactory.Identity serverWrongSan = TestCertFactory.createServerLeaf("wrong.example.com", caA, null, "wrong.example.com");
        TestCertFactory.Identity selfSignedLeaf = TestCertFactory.createSelfSignedLeaf("127.0.0.1", "127.0.0.1", null);
        String statsJson = "{\"periods\":{\"today\":{\"totalTokens\":4242}}}";

        SSLSocketFactory defaultFactoryBefore = HttpsURLConnection.getDefaultSSLSocketFactory();
        HubClient client = new HubClient();

        // 1. CA:TRUE pinned CA succeeds; system CA and wrong CA fail.
        try (SSLServerSocket srv = startTlsHub(serverA, TEST_SECRET, statsJson)) {
            String baseUrl = "https://127.0.0.1:" + srv.getLocalPort();
            ConnectionSpec pinnedA = new ConnectionSpec(baseUrl, TEST_SECRET, false, caA.pem);
            JSONObject stats = client.get(pinnedA, "/api/stats");
            assertEquals(4242, stats.getJSONObject("periods").getJSONObject("today").getInt("totalTokens"));

            ConnectionSpec systemSpec = new ConnectionSpec(baseUrl, TEST_SECRET, false, "");
            try {
                client.get(systemSpec, "/api/stats");
                fail("System CA must reject private CA server");
            } catch (SSLException expected) { /* ok */ }

            ConnectionSpec pinnedB = new ConnectionSpec(baseUrl, TEST_SECRET, false, caB.pem);
            try {
                client.get(pinnedB, "/api/stats");
                fail("Wrong pinned CA B must reject server signed by CA A");
            } catch (SSLException expected) { /* ok */ }
        }

        // 2. Direct self-signed leaf (CA:FALSE) pinned succeeds; wrong CA fails.
        try (SSLServerSocket srv = startTlsHub(selfSignedLeaf, TEST_SECRET, statsJson)) {
            String baseUrl = "https://127.0.0.1:" + srv.getLocalPort();
            ConnectionSpec pinnedLeaf = new ConnectionSpec(baseUrl, TEST_SECRET, false, selfSignedLeaf.pem);
            JSONObject stats = client.get(pinnedLeaf, "/api/stats");
            assertEquals(4242, stats.getJSONObject("periods").getJSONObject("today").getInt("totalTokens"));

            ConnectionSpec pinnedA = new ConnectionSpec(baseUrl, TEST_SECRET, false, caA.pem);
            try {
                client.get(pinnedA, "/api/stats");
                fail("Unrelated CA A must reject self-signed leaf");
            } catch (SSLException expected) { /* ok */ }
        }

        // 3. Valid pinned CA with mismatched SAN must fail (HostnameVerifier stays strictly enabled).
        try (SSLServerSocket srv = startTlsHub(serverWrongSan, TEST_SECRET, statsJson)) {
            String baseUrl = "https://127.0.0.1:" + srv.getLocalPort();
            ConnectionSpec pinnedA = new ConnectionSpec(baseUrl, TEST_SECRET, false, caA.pem);
            try {
                client.get(pinnedA, "/api/stats");
                fail("Mismatched SAN must be rejected by HostnameVerifier even when CA matches");
            } catch (SSLException expected) { /* ok */ }
        }

        // 4. Global default SSLSocketFactory (used by GitHubUpdateClient) must stay untouched.
        assertSame("Default SSLSocketFactory must not be mutated",
                defaultFactoryBefore, HttpsURLConnection.getDefaultSSLSocketFactory());
    }

    @Test public void mainActivityImportsCustomCaDraftConnectsOverTlsAndTearsDownCleanly() throws Exception {
        TestCertFactory.Identity caA = TestCertFactory.createCa("WebView Bridge CA");
        TestCertFactory.Identity serverA = TestCertFactory.createServerLeaf("127.0.0.1", caA, "127.0.0.1", "localhost");
        String nowIso = java.time.Instant.now().toString();
        String statsJson = "{\"devices\":[{\"deviceId\":\"tls-pc\",\"updatedAt\":\"" + nowIso + "\",\"stale\":false,\"periods\":{\"today\":{\"totalTokens\":777,\"inputTokens\":400,\"outputTokens\":377}}}],\"periods\":{\"today\":{\"totalTokens\":777,\"inputTokens\":400,\"outputTokens\":377}},\"subscriptionsUpdatedAt\":\"\"}";

        try (SSLServerSocket srv = startTlsHub(serverA, TEST_SECRET, statsJson);
             ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitScript(scenario, "typeof window.receiveNative === 'function' && document.getElementById('settings') && !document.getElementById('settings').hidden");

            // Validate PEM via native bridge and capture ephemeral draftToken without exposing raw PEM in DOM.
            evaluate(scenario, "window.__testDraft = null; const orig = window.receiveNative; window.receiveNative = (msg) => { const p = typeof msg === 'string' ? JSON.parse(msg) : msg; if (p && p.type === 'caCertDraft') window.__testDraft = p; orig(msg); };");
            evaluate(scenario, "window.HubNative.validateCaCertificatePem(" + JSONObject.quote(caA.pem) + ", 'inst-req-1')");
            awaitScript(scenario, "window.__testDraft && window.__testDraft.ok === true && Boolean(window.__testDraft.draftToken)");

            assertEquals("false", evaluate(scenario, "JSON.stringify(window.__testDraft).includes('BEGIN CERTIFICATE')"));
            assertEquals("true", evaluate(scenario, "window.__testDraft.cert.subject.includes('WebView Bridge CA')"));

            // Connect over HTTPS using connectWithTls and verify Hub stats load over pinned TLS.
            String url = "https://127.0.0.1:" + srv.getLocalPort();
            evaluate(scenario, "window.HubNative.connectWithTls(" + JSONObject.quote(url) + ", "
                    + JSONObject.quote(TEST_SECRET) + ", false, window.__testDraft.draftToken)");
            awaitScript(scenario, "document.querySelector('.token-total') && document.querySelector('.token-total').textContent === '777'");
            awaitScript(scenario, "document.getElementById('status-label') && document.getElementById('status-label').textContent === '已连接'");

            // Verify Keystore persisted the encrypted CA PEM cleanly.
            ConnectionSpec saved = new ConnectionStore(context).load();
            assertNotNull(saved);
            assertTrue(saved.hasCustomCa());
            assertEquals(url, saved.url);
            assertEquals("false", evaluate(scenario, "document.body.innerText.includes('BEGIN CERTIFICATE')"));
        }
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView view = findWebView(activity.getWindow().getDecorView());
            assertNotNull("Activity must host WebView", view);
            view.evaluateJavascript(script, value -> {
                result.set(value);
                latch.countDown();
            });
        });
        assertTrue("WebView JS callback timed out", latch.await(WEBVIEW_TIMEOUT_MS, TimeUnit.MILLISECONDS));
        return result.get();
    }

    private static void awaitScript(ActivityScenario<MainActivity> scenario, String expr) throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + WEBVIEW_TIMEOUT_MS;
        String last;
        do {
            last = evaluate(scenario, "Boolean(" + expr + ")");
            if ("true".equals(last)) return;
            Thread.sleep(100);
        } while (android.os.SystemClock.elapsedRealtime() < deadline);
        fail("WebView did not reach expected state: " + expr + "; last=" + last);
    }
}
