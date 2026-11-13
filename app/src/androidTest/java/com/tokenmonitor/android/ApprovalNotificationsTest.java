package com.tokenmonitor.android;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.service.notification.StatusBarNotification;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
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

    @Before public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        SessionNotifications.channels(context);
        ApprovalNotifications.cancelAll(context);
        new ConnectionStore(context).clear();
        new ApprovalStore(context).clear();
    }

    @After public void tearDown() {
        ApprovalNotifications.cancelAll(context);
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

        if (SessionNotifications.approvalsAllowed(context)) {
            ApprovalNotifications.notifyNew(context, destination, alerts, now, store);
            StatusBarNotification found = findTag(manager, ApprovalNotifications.tag(destination, DEMO_ID));
            assertNotNull("Expected read-only approval alert notification when channel is allowed", found);
            Notification n = found.getNotification();
            assertNotNull(n.publicVersion);
            assertTrue("Read-only alert must not expose Allow/Deny actions", n.actions == null || n.actions.length == 0);
            assertTrue((n.flags & Notification.FLAG_AUTO_CANCEL) != 0);

            ApprovalNotifications.cancelAll(context);
            assertNull(findTag(manager, ApprovalNotifications.tag(destination, DEMO_ID)));

            ApprovalNotifications.notifyNew(context, destination, alerts, now + 1000L, store);
            assertNull("Single-shot claim must not re-notify same alert ID",
                    findTag(manager, ApprovalNotifications.tag(destination, DEMO_ID)));
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

    private static StatusBarNotification findTag(NotificationManager manager, String tag) {
        StatusBarNotification[] active = manager.getActiveNotifications();
        if (active == null) return null;
        for (StatusBarNotification sbn : active) {
            if (tag.equals(sbn.getTag())) return sbn;
        }
        return null;
    }
}
