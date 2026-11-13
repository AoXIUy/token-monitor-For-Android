package com.tokenmonitor.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class ApprovalNotificationsTest {
    private static final String DEMO_ID = "11111111-1111-4111-8111-111111111111";
    private Context context;

    @Before public void setUp() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        SessionNotifications.channels(context);
        ApprovalNotifications.cancelAll(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) awaitNoApprovalTags(manager, 5_000L);
        new ConnectionStore(context).clear();
        new ApprovalStore(context).clear();
    }

    @After public void tearDown() throws Exception {
        ApprovalNotifications.cancelAll(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) awaitNoApprovalTags(manager, 5_000L);
        new ConnectionStore(context).clear();
        new ApprovalStore(context).clear();
    }

    @Test public void notifyNewPostsSingleShotReadOnlyNotificationWithoutActions() throws Exception {
        String destination = new ConnectionSpec("http://127.0.0.1:17321", "approval-secret", true).fingerprint();
        String otherDestination = new ConnectionSpec("http://127.0.0.1:17322", "approval-secret", true).fingerprint();
        ApprovalStore store = new ApprovalStore(context);
        long now = System.currentTimeMillis();
        JSONArray alerts = new JSONArray().put(new JSONObject()
                .put("id", DEMO_ID)
                .put("deviceId", "dev-1")
                .put("deviceName", "Workstation")
                .put("client", "codex")
                .put("tool", "Bash")
                .put("command", "npm test")
                .put("description", "Run verification tests")
                .put("projectLabel", "token-monitor")
                .put("createdAt", now)
                .put("expiresAt", now + 120_000L));

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        assertNotNull(manager);
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
                    context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }

        String tag = ApprovalNotifications.tag(destination, DEMO_ID);
        if (SessionNotifications.approvalsAllowed(context)) {
            ApprovalNotifications.notifyNew(context, destination, alerts, now, store);
            // NotificationManager posts and cancels asynchronously via NotificationManagerService.
            StatusBarNotification found = awaitTag(manager, tag, true, 10_000L);
            assertNotNull("Expected read-only approval alert notification when channel is allowed", found);
            Notification n = found.getNotification();
            assertNotNull(n.publicVersion);
            assertTrue("Read-only alert must not expose Allow/Deny actions", n.actions == null || n.actions.length == 0);
            assertTrue((n.flags & Notification.FLAG_AUTO_CANCEL) != 0);

            ApprovalNotifications.cancelAll(context);
            assertNull("Expected approval alert notification to clear after cancelAll",
                    awaitTag(manager, tag, false, 10_000L));

            ApprovalNotifications.notifyNew(context, destination, alerts, now + 1000L, store);
            Thread.sleep(300L);
            assertNull("Single-shot claim must not re-notify same alert ID", findTag(manager, tag));
        } else {
            assertTrue(store.claim(destination, DEMO_ID));
        }

        assertFalse("Duplicate claim for same destination and ID must be ignored",
                store.claim(destination, DEMO_ID));
        assertTrue("Claim for different Hub destination must stay isolated",
                store.claim(otherDestination, DEMO_ID));
    }

    @Test public void hubClientFetchesApprovalAlertsViaGetOnly() throws Exception {
        ServerSocket server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        List<String> requestLines = new ArrayList<>();
        AtomicReference<String> authHeader = new AtomicReference<>("");
        CountDownLatch received = new CountDownLatch(1);

        Thread serverThread = new Thread(() -> {
            try (Socket socket = server.accept()) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                String firstLine = reader.readLine();
                if (firstLine != null) requestLines.add(firstLine);
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    if (line.regionMatches(true, 0, "Authorization:", 0, 14)) {
                        authHeader.set(line.substring(14).trim());
                    }
                }
                byte[] resp = ("{\"ok\":true,\"enabled\":true,\"alerts\":[{\"id\":\"" + DEMO_ID + "\",\"client\":\"codex\",\"tool\":\"Bash\"}]}")
                        .getBytes(StandardCharsets.UTF_8);
                OutputStream out = socket.getOutputStream();
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                        + resp.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(resp);
                out.flush();
                received.countDown();
            } catch (Exception ignored) { }
        });
        serverThread.start();

        try {
            ConnectionSpec spec = new ConnectionSpec("http://127.0.0.1:" + server.getLocalPort(), "alerts-secret", true);
            JSONObject response = new HubClient().approvalAlerts(spec);
            assertTrue(response.optBoolean("ok", false));
            assertTrue(response.optBoolean("enabled", false));
            assertEquals(1, response.optJSONArray("alerts").length());
            assertTrue(received.await(5, TimeUnit.SECONDS));
            assertEquals(1, requestLines.size());
            assertTrue(requestLines.get(0).startsWith("GET /api/approval-alerts "));
            assertEquals("Bearer alerts-secret", authHeader.get());
        } finally {
            server.close();
            serverThread.join(3000);
        }
    }

    private static StatusBarNotification awaitTag(NotificationManager manager, String tag, boolean expectedPresent, long timeoutMs)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        StatusBarNotification current = findTag(manager, tag);
        while ((current != null) != expectedPresent && System.currentTimeMillis() < deadline) {
            Thread.sleep(100L);
            current = findTag(manager, tag);
        }
        return current;
    }

    private static void awaitNoApprovalTags(NotificationManager manager, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            boolean anyLeft = false;
            StatusBarNotification[] active = manager.getActiveNotifications();
            if (active != null) {
                for (StatusBarNotification sbn : active) {
                    if (sbn.getTag() != null && sbn.getTag().startsWith(ApprovalNotifications.TAG_PREFIX)) {
                        anyLeft = true;
                        break;
                    }
                }
            }
            if (!anyLeft) return;
            Thread.sleep(100L);
        }
    }

    private static StatusBarNotification findTag(NotificationManager manager, String tag) {
        StatusBarNotification[] active = manager.getActiveNotifications();
        if (active == null) return null;
        for (StatusBarNotification sbn : active) {
            if (tag.equals(sbn.getTag())) return sbn;
        }
        return null;
    }
}
