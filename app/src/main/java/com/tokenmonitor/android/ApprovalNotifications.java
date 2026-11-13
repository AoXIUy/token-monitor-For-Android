package com.tokenmonitor.android;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/** Posts read-only approval alert notifications (no approve/deny actions). */
final class ApprovalNotifications {
    static final String TAG_PREFIX = "approval:";
    static final int NOTIFICATION_ID = 4;
    static final String EXTRA_OPEN_APPROVALS = "openApprovalAlerts";
    static final String EXTRA_APPROVAL_DESTINATION = "approvalAlertDestination";
    private static final String UUID_RE = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";

    static String tag(String destination, String id) {
        return TAG_PREFIX + destination + ":" + id;
    }

    static boolean isValidId(String id) {
        return id != null && id.matches(UUID_RE);
    }

    static String sanitizeSingleLine(String value, int max) {
        if (value == null) return "";
        String cleaned = value.replaceAll("[\\p{Cntrl}]+", " ").trim();
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max);
    }

    static String sanitizeBody(String value, int max) {
        if (value == null) return "";
        String cleaned = value.replaceAll("[\\x00-\\x09\\x0b-\\x1f\\x7f]+", " ").trim();
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max) + "…";
    }

    private static String clientLabel(String client) {
        if ("codex".equals(client)) return "Codex";
        if ("antigravity".equals(client)) return "Antigravity";
        return sanitizeSingleLine(client, 32);
    }

    private static PendingIntent openAppIntent(Context context, String destination, String id) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_OPEN_APPROVALS, true)
                .putExtra(EXTRA_APPROVAL_DESTINATION, destination);
        intent.setData(new Uri.Builder().scheme("tokenmonitor").authority("approval-alerts")
                .appendPath(destination).appendPath(id).build());
        return PendingIntent.getActivity(context, 40, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @android.annotation.SuppressLint("MissingPermission")
    static void notifyNew(Context context, String destination, JSONArray alerts, long nowMs, ApprovalStore store) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || alerts == null || !SessionNotifications.approvalsAllowed(context)
                || destination == null || destination.isEmpty() || store == null) {
            return;
        }
        Notification publicVersion = new Notification.Builder(context, SessionNotifications.APPROVAL_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Token Monitor · 需要电脑端确认")
                .setContentText("有一个会话操作等待在电脑端确认")
                .build();
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject item = alerts.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id", "").toLowerCase(Locale.ROOT);
            long expiresAt = item.optLong("expiresAt", 0);
            if (!isValidId(id) || expiresAt <= nowMs) continue;
            if (!store.claim(destination, id)) continue;

            String client = clientLabel(item.optString("client", ""));
            String deviceName = sanitizeSingleLine(item.optString("deviceName", item.optString("deviceId", "")), 48);
            String tool = sanitizeSingleLine(item.optString("tool", ""), 64);
            String project = sanitizeSingleLine(item.optString("projectLabel", ""), 64);
            String command = sanitizeBody(item.optString("command", ""), 600);
            String description = sanitizeSingleLine(item.optString("description", ""), 200);

            String title = client + " 需要确认" + (deviceName.isEmpty() ? "" : " · " + deviceName);
            String summary = (project.isEmpty() ? "" : "[" + project + "] ")
                    + (tool.isEmpty() ? "操作" : tool)
                    + (description.isEmpty() ? "" : " · " + description);
            String body = (command.isEmpty() ? summary : summary + "\n" + command) + "\n请前往电脑端确认";

            Notification notification = new Notification.Builder(context, SessionNotifications.APPROVAL_CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(title)
                    .setContentText(command.isEmpty() ? summary : command)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .setPublicVersion(publicVersion)
                    .setContentIntent(openAppIntent(context, destination, id))
                    .build();
            manager.notify(tag(destination, id), NOTIFICATION_ID, notification);
        }
    }

    static void cancelAll(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        StatusBarNotification[] active = manager.getActiveNotifications();
        if (active == null) return;
        for (StatusBarNotification sbn : active) {
            if (sbn.getTag() != null && sbn.getTag().startsWith(TAG_PREFIX)) {
                manager.cancel(sbn.getTag(), sbn.getId());
            }
        }
    }
}
