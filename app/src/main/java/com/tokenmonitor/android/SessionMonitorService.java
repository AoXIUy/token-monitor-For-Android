package com.tokenmonitor.android;

import android.app.Service;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONObject;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started, visible background monitoring; never collects local usage. */
public final class SessionMonitorService extends Service {
    static final String ACTION_STOP = "com.tokenmonitor.android.STOP_MONITOR";
    private static volatile boolean running;
    private static volatile String currentMessage = "";
    private static volatile long lastReadAt;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable poll = this::tick;
    private HubClient client;
    private ConnectionSpec connection;
    private MonitorPreferences preferences;
    private SessionCompletionTracker tracker;
    private int generation, failures;

    static boolean running() { return running; }
    static long lastReadAt() { return lastReadAt; }
    static String message(Context context) {
        return new MonitorPreferences(context).message();
    }
    static void stop(Context context, String reason, boolean clearNotifications) {
        new MonitorPreferences(context).state(false, reason);
        running = false;
        currentMessage = reason;
        context.stopService(new Intent(context, SessionMonitorService.class));
        if (clearNotifications) context.getSystemService(NotificationManager.class).cancelAll();
    }

    @Override public void onCreate() {
        super.onCreate();
        preferences = new MonitorPreferences(this);
        SessionNotifications.channels(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) { finish("完成提醒已关闭"); return START_NOT_STICKY; }
        try {
            ConnectionSpec next = new ConnectionStore(this).load();
            if (next == null || !SessionNotifications.allowed(this)) { finish("请连接 Hub 并允许通知后开启提醒"); return START_NOT_STICKY; }
            if (running && connection != null && connection.fingerprint().equals(next.fingerprint())) return START_NOT_STICKY;
            connection = next;
            tracker = new SessionCompletionTracker();
            generation++;
            if (client != null) client.cancel();
            main.removeCallbacks(poll);
            lastReadAt = 0;
            currentMessage = "正在读取 Hub，建立会话提醒基线…";
            if (Build.VERSION.SDK_INT >= 29) startForeground(SessionNotifications.MONITOR_ID, SessionNotifications.ongoing(this, currentMessage), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(SessionNotifications.MONITOR_ID, SessionNotifications.ongoing(this, currentMessage));
            running = true;
            preferences.state(true, currentMessage);
            main.post(poll);
        } catch (Exception error) { finish("后台监控未能启动，请回到应用重新开启"); }
        return START_NOT_STICKY;
    }

    private void updateMessage(String value) {
        if (value.equals(currentMessage)) return;
        currentMessage = value;
        preferences.state(true, value);
        getSystemService(NotificationManager.class).notify(SessionNotifications.MONITOR_ID, SessionNotifications.ongoing(this, value));
    }

    private void tick() {
        if (!running) return;
        final int epoch = generation;
        final ConnectionSpec destination = connection;
        final SessionCompletionTracker detector = tracker;
        final HubClient request = new HubClient();
        client = request;
        network.execute(() -> {
            try {
                JSONObject stats = request.get(destination, "/api/stats");
                if (stats.optJSONArray("devices") == null || stats.optJSONObject("periods") == null) throw new IllegalStateException("Invalid stats");
                long now = System.currentTimeMillis();
                List<SessionCompletionTracker.Observation> completed = detector.accept(CompletionObservations.fromStats(stats, now), now);
                main.post(() -> {
                    if (epoch != generation || !running) return;
                    try {
                        ConnectionSpec saved = new ConnectionStore(this).load();
                        if (saved == null || !saved.fingerprint().equals(destination.fingerprint()) || !preferences.enabled()) { finish("Hub 连接已变更，请重新开启提醒"); return; }
                        if (!SessionNotifications.allowed(this)) { finish("通知权限已关闭，完成提醒已暂停"); return; }
                        failures = 0;
                        lastReadAt = now;
                        updateMessage("每 5 秒检查会话结束 · 点击可返回应用");
                        for (SessionCompletionTracker.Observation row : completed) {
                            // Claim durably before display so a restart/correction cannot alert twice.
                            if (preferences.claim(destination.fingerprint(), row.eventId())) SessionNotifications.completion(this, destination.fingerprint(), row);
                        }
                        main.postDelayed(poll, 5000);
                    } catch (Exception error) { finish("通知状态保存失败，监控已暂停，请检查存储和通知权限"); }
                });
            } catch (Exception error) {
                main.post(() -> {
                    if (epoch != generation || !running) return;
                    if (error instanceof HubClient.HubError && (((HubClient.HubError) error).status == 401 || ((HubClient.HubError) error).status == 403)) {
                        finish("Hub 认证失败，完成提醒已暂停"); return;
                    }
                    try { updateMessage("Hub 暂时断线，正在自动重试"); }
                    catch (Exception failure) { finish("无法保存监控状态，完成提醒已暂停"); return; }
                    failures = Math.min(failures + 1, 4);
                    main.postDelayed(poll, Math.min(60000, 5000L * (1 << failures)));
                });
            }
        });
    }

    private void finish(String reason) {
        running = false;
        currentMessage = reason;
        generation++;
        main.removeCallbacks(poll);
        if (client != null) client.cancel();
        try { preferences.state(false, reason); } catch (Exception ignored) { }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onTimeout(int startId, int fgsType) {
        finish("系统已暂停长时间后台监控，请打开应用重新开启完成提醒");
    }
    @Override public void onDestroy() {
        running = false;
        generation++;
        main.removeCallbacks(poll);
        if (client != null) client.cancel();
        network.shutdownNow();
        try {
            if (preferences.enabled()) {
                currentMessage = "后台监控已停止，请重新开启";
                preferences.state(false, currentMessage);
            }
        } catch (Exception ignored) { }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
