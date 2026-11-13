package com.tokenmonitor.android;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started, visible background monitoring for completion and approval alerts; never collects local usage. */
public final class SessionMonitorService extends Service {
    static final String ACTION_STOP = "com.tokenmonitor.android.STOP_MONITOR";
    static final String ACTION_SYNC = "com.tokenmonitor.android.SYNC_MONITOR";
    private static volatile boolean running;
    private static volatile String currentTitle = "Token Monitor · 完成提醒";
    private static volatile String currentMessage = "";
    private static volatile long lastReadAt;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable poll = this::tick;
    private HubClient client;
    private ConnectionSpec connection;
    private MonitorPreferences preferences;
    private ApprovalStore approvalStore;
    private SessionCompletionTracker tracker;
    private int generation, failures;

    static boolean running() { return running; }
    static long lastReadAt() { return lastReadAt; }
    static String message(Context context) {
        return new MonitorPreferences(context).message();
    }
    static void stop(Context context, String reason, boolean clearNotifications) {
        new MonitorPreferences(context).state(false, reason);
        try { new ApprovalStore(context).saveState(false, "off", "审批提醒未开启"); } catch (Exception ignored) { }
        ApprovalNotifications.cancelAll(context);
        running = false;
        currentMessage = reason;
        context.stopService(new Intent(context, SessionMonitorService.class));
        if (clearNotifications) context.getSystemService(NotificationManager.class).cancelAll();
    }

    @Override public void onCreate() {
        super.onCreate();
        preferences = new MonitorPreferences(this);
        approvalStore = new ApprovalStore(this);
        SessionNotifications.channels(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            finishAll("后台监控已关闭", true);
            return START_NOT_STICKY;
        }
        try {
            boolean enableCompletionDefault = !ACTION_SYNC.equals(action);
            if (enableCompletionDefault && !preferences.enabled()) {
                preferences.state(true, "正在读取 Hub，建立会话提醒基线…");
            }
            boolean wantCompletions = preferences.enabled();
            boolean wantApprovals = approvalStore.enabled();
            if (!wantCompletions && !wantApprovals) {
                finishAll(preferences.message(), false);
                return START_NOT_STICKY;
            }
            ConnectionSpec next = new ConnectionStore(this).load();
            if (next == null) {
                if (wantCompletions) preferences.state(false, "请连接 Hub 并允许通知后开启提醒");
                if (wantApprovals) approvalStore.saveState(false, "error", "请先连接 Hub 再开启审批提醒");
                finishAll("请先连接 Hub 后再开启后台监控", true);
                return START_NOT_STICKY;
            }
            if (wantCompletions && !SessionNotifications.allowed(this)) {
                preferences.state(false, "请在系统通知设置中允许完成提醒");
                wantCompletions = false;
            }
            if (wantApprovals && !SessionNotifications.approvalsAllowed(this)) {
                approvalStore.saveState(false, "error", "请在系统通知设置中允许审批提醒通知");
                wantApprovals = false;
            }
            if (!wantCompletions && !wantApprovals) {
                finishAll("请在系统通知设置中允许通知后开启", true);
                return START_NOT_STICKY;
            }
            if (running && connection != null && connection.fingerprint().equals(next.fingerprint())) {
                refreshOngoingText(wantCompletions, wantApprovals, null);
                main.removeCallbacks(poll);
                main.post(poll);
                return START_NOT_STICKY;
            }
            connection = next;
            tracker = new SessionCompletionTracker();
            generation++;
            if (client != null) client.cancel();
            main.removeCallbacks(poll);
            lastReadAt = 0;
            currentTitle = titleFor(wantCompletions, wantApprovals);
            currentMessage = wantCompletions && !wantApprovals
                    ? "正在读取 Hub，建立会话提醒基线…"
                    : "正在连接 Hub，建立后台监控…";
            if (Build.VERSION.SDK_INT >= 29) startForeground(SessionNotifications.MONITOR_ID, SessionNotifications.ongoing(this, currentTitle, currentMessage), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(SessionNotifications.MONITOR_ID, SessionNotifications.ongoing(this, currentTitle, currentMessage));
            running = true;
            if (wantCompletions) preferences.state(true, currentMessage);
            main.post(poll);
        } catch (Exception error) {
            finishAll("后台监控未能启动，请回到应用重新开启", true);
        }
        return START_NOT_STICKY;
    }

    private static String titleFor(boolean completions, boolean approvals) {
        if (completions && approvals) return "Token Monitor · 后台监控";
        if (approvals) return "Token Monitor · 审批提醒";
        return "Token Monitor · 完成提醒";
    }

    private void refreshOngoingText(boolean completions, boolean approvals, String overrideMessage) {
        String nextTitle = titleFor(completions, approvals);
        String nextMessage = overrideMessage != null ? overrideMessage
                : (completions && approvals) ? "每 5 秒检查会话结束与审批提醒 · 点击可返回应用"
                : approvals ? "每 5 秒检查 Codex / Antigravity 确认提醒 · 点击可返回应用"
                : "每 5 秒检查会话结束 · 点击可返回应用";
        updateNotification(nextTitle, nextMessage, completions);
    }

    private void updateNotification(String title, String value, boolean writeCompletionPrefs) {
        if (writeCompletionPrefs) {
            preferences.state(true, value);
        }
        if (title.equals(currentTitle) && value.equals(currentMessage)) return;
        currentTitle = title;
        currentMessage = value;
        getSystemService(NotificationManager.class).notify(
                SessionNotifications.MONITOR_ID,
                SessionNotifications.ongoing(this, title, value));
    }

    private void tick() {
        if (!running) return;
        final boolean wantCompletions = preferences.enabled();
        final boolean wantApprovals = approvalStore.enabled();
        if (!wantCompletions && !wantApprovals) {
            finishAll(preferences.message(), false);
            return;
        }
        final int epoch = generation;
        final ConnectionSpec destination = connection;
        final SessionCompletionTracker detector = tracker;
        final HubClient request = new HubClient();
        client = request;
        network.execute(() -> {
            try {
                List<SessionCompletionTracker.Observation> completed = null;
                if (wantCompletions) {
                    JSONObject stats = request.get(destination, "/api/stats");
                    if (stats.optJSONArray("devices") == null || stats.optJSONObject("periods") == null) {
                        throw new IllegalStateException("Invalid stats");
                    }
                    // The Hub can observe activity while the request is in flight.
                    // Validate against receipt time so those records are not future data.
                    long now = System.currentTimeMillis();
                    completed = detector.accept(CompletionObservations.fromStats(stats, now), now);
                }

                String nextApprovalStatus = null;
                String nextApprovalMessage = null;
                JSONArray approvalsArray = null;
                if (wantApprovals) {
                    try {
                        JSONObject payload = request.approvalAlerts(destination);
                        if (payload.optBoolean("ok", false) && payload.optJSONArray("alerts") != null) {
                            approvalsArray = payload.getJSONArray("alerts");
                            nextApprovalStatus = "ok";
                            nextApprovalMessage = approvalsArray.length() > 0
                                    ? ("待电脑端确认 " + approvalsArray.length() + " 项")
                                    : "审批提醒在线 · 等待需要确认的操作";
                        } else {
                            String err = payload.optString("error", "");
                            approvalsArray = new JSONArray();
                            if ("disabled".equals(err)) {
                                nextApprovalStatus = "disabled";
                                nextApprovalMessage = "Hub 未开启审批提醒，请在桌面端启用";
                            } else {
                                nextApprovalStatus = "error";
                                nextApprovalMessage = "Hub 返回异常状态（" + err + "）";
                            }
                        }
                    } catch (HubClient.HubError error) {
                        if (error.status == 401 || error.status == 403) throw error;
                        if (error.status == 404) {
                            approvalsArray = new JSONArray();
                            nextApprovalStatus = "unsupported";
                            nextApprovalMessage = "当前连接的 Hub 不支持审批提醒接口";
                        } else if (!wantCompletions) {
                            throw error;
                        } else {
                            approvalsArray = new JSONArray();
                            nextApprovalStatus = "error";
                            nextApprovalMessage = error.getMessage();
                        }
                    }
                }

                final List<SessionCompletionTracker.Observation> finalCompleted = completed;
                final JSONArray finalApprovals = approvalsArray;
                final String finalApprovalStatus = nextApprovalStatus;
                final String finalApprovalMessage = nextApprovalMessage;
                final long readAt = System.currentTimeMillis();

                main.post(() -> {
                    if (epoch != generation || !running) return;
                    try {
                        ConnectionSpec saved = new ConnectionStore(this).load();
                        boolean stillCompletions = preferences.enabled();
                        boolean stillApprovals = approvalStore.enabled();
                        if (saved == null || !saved.fingerprint().equals(destination.fingerprint())) {
                            finishAll("Hub 连接已变更，请重新开启监控", true);
                            return;
                        }
                        if (!stillCompletions && !stillApprovals) {
                            finishAll(preferences.message(), false);
                            return;
                        }
                        if (stillCompletions && !SessionNotifications.allowed(this)) {
                            preferences.state(false, "通知权限已关闭，完成提醒已暂停");
                            stillCompletions = false;
                        }
                        if (stillApprovals && !SessionNotifications.approvalsAllowed(this)) {
                            approvalStore.saveState(false, "error", "通知权限已关闭，审批提醒已暂停");
                            ApprovalNotifications.cancelAll(this);
                            stillApprovals = false;
                        }
                        if (!stillCompletions && !stillApprovals) {
                            finishAll("通知权限已关闭，后台监控已暂停", true);
                            return;
                        }
                        failures = 0;
                        lastReadAt = readAt;
                        refreshOngoingText(stillCompletions, stillApprovals, null);
                        if (stillCompletions && finalCompleted != null) {
                            for (SessionCompletionTracker.Observation row : finalCompleted) {
                                // Claim durably before display so a restart/correction cannot alert twice.
                                if (preferences.claim(destination.fingerprint(), row.eventId())) {
                                    SessionNotifications.completion(this, destination.fingerprint(), row);
                                }
                            }
                        }
                        if (stillApprovals && finalApprovals != null) {
                            if (finalApprovalStatus != null) {
                                approvalStore.saveState(true, finalApprovalStatus, finalApprovalMessage);
                            }
                            ApprovalNotifications.notifyNew(this, destination.fingerprint(), finalApprovals, System.currentTimeMillis(), approvalStore);
                        }
                        main.postDelayed(poll, 5000);
                    } catch (Exception error) {
                        finishAll("通知状态保存失败，监控已暂停，请检查存储和通知权限", true);
                    }
                });
            } catch (Exception error) {
                main.post(() -> {
                    if (epoch != generation || !running) return;
                    if (error instanceof HubClient.HubError && (((HubClient.HubError) error).status == 401 || ((HubClient.HubError) error).status == 403)) {
                        finishAll("Hub 认证失败，后台监控已暂停", true);
                        return;
                    }
                    try {
                        boolean stillCompletions = preferences.enabled();
                        boolean stillApprovals = approvalStore.enabled();
                        if (stillApprovals) {
                            approvalStore.saveState(true, "offline", "Hub 暂时断线，正在自动重试");
                        }
                        refreshOngoingText(stillCompletions, stillApprovals, "Hub 暂时断线，正在自动重试");
                    } catch (Exception failure) {
                        finishAll("无法保存监控状态，后台监控已暂停", true);
                        return;
                    }
                    failures = Math.min(failures + 1, 4);
                    main.postDelayed(poll, Math.min(60000, 5000L * (1 << failures)));
                });
            }
        });
    }

    private void finishAll(String reason, boolean disableApprovals) {
        running = false;
        currentMessage = reason;
        generation++;
        main.removeCallbacks(poll);
        if (client != null) client.cancel();
        try { preferences.state(false, reason); } catch (Exception ignored) { }
        if (disableApprovals) {
            try { approvalStore.saveState(false, "off", reason); } catch (Exception ignored) { }
            ApprovalNotifications.cancelAll(this);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onTimeout(int startId, int fgsType) {
        finishAll("系统已暂停长时间后台监控，请打开应用重新开启", true);
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
            if (approvalStore.enabled()) {
                approvalStore.saveState(false, "off", "审批提醒已停止，请重新开启");
                ApprovalNotifications.cancelAll(this);
            }
        } catch (Exception ignored) { }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
