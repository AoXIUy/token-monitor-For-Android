package com.tokenmonitor.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

final class SessionNotifications {
    static final String MONITOR_CHANNEL = "session-monitor";
    static final String COMPLETION_CHANNEL = "session-completions";
    static final int MONITOR_ID = 1;
    static final String EXTRA_KEY = "sessionKey";
    static final String EXTRA_DESTINATION = "sessionDestination";

    static boolean allowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return false;
        NotificationChannel channel = manager.getNotificationChannel(COMPLETION_CHANNEL);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel monitoring = new NotificationChannel(MONITOR_CHANNEL, "后台会话监控", NotificationManager.IMPORTANCE_LOW);
        monitoring.setDescription("开启完成提醒时显示的持续监控状态");
        monitoring.setShowBadge(false);
        NotificationChannel completion = new NotificationChannel(COMPLETION_CHANNEL, "会话完成提醒", NotificationManager.IMPORTANCE_HIGH);
        completion.setDescription("已观察到活动的会话出现明确本轮结束标记时提醒");
        completion.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(monitoring);
        manager.createNotificationChannel(completion);
    }

    private static PendingIntent open(Context context, String destination, String key) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!key.isEmpty()) {
            intent.putExtra(EXTRA_KEY, key).putExtra(EXTRA_DESTINATION, destination);
            intent.setData(new Uri.Builder().scheme("tokenmonitor").authority("session")
                    .appendPath(destination).appendPath(ConnectionSpec.digest(key)).build());
        }
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Notification ongoing(Context context, String message) {
        PendingIntent stop = PendingIntent.getService(context, 1,
                new Intent(context, SessionMonitorService.class).setAction(SessionMonitorService.ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(context, MONITOR_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle("Token Monitor · 完成提醒")
                .setContentText(message).setOngoing(true).setOnlyAlertOnce(true)
                .setContentIntent(open(context, "", ""))
                .addAction(new Notification.Action.Builder(null, "停止监控", stop).build()).build();
    }

    @android.annotation.SuppressLint("MissingPermission")
    static void completion(Context context, String destination, SessionCompletionTracker.Observation observation) {
        if (!allowed(context)) return;
        String label = observation.label.replaceAll("[\\p{Cntrl}]", " ");
        if (label.length() > 120) label = label.substring(0, 120);
        Notification publicVersion = new Notification.Builder(context, COMPLETION_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle("Token Monitor")
                .setContentText("一个会话的本轮任务已结束").build();
        Notification notification = new Notification.Builder(context, COMPLETION_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle(observation.client + " · 本轮已结束")
                .setContentText(label).setStyle(new Notification.BigTextStyle().bigText(label))
                .setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
                .setContentIntent(open(context, destination, observation.key)).build();
        context.getSystemService(NotificationManager.class).notify("session:" + destination + ":" + ConnectionSpec.digest(observation.key), 2, notification);
    }

    @android.annotation.SuppressLint("MissingPermission")
    static void test(Context context) {
        if (!allowed(context)) return;
        context.getSystemService(NotificationManager.class).notify("test", 3,
                new Notification.Builder(context, COMPLETION_CHANNEL).setSmallIcon(R.drawable.ic_notification)
                        .setContentTitle("Token Monitor · 测试通知").setContentText("通知已开启；会话收到明确结束信号后将在这里提醒。")
                        .setAutoCancel(true).setContentIntent(open(context, "", "")).build());
    }
}
