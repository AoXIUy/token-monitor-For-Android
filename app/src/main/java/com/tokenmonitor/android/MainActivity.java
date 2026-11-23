package com.tokenmonitor.android;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.ThreadPoolExecutor conversationNetwork = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.ArrayBlockingQueue<>(1),
            new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private HubClient conversationClient;
    private int conversationGeneration;
    private final java.util.concurrent.ThreadPoolExecutor reportsListNetwork = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.ArrayBlockingQueue<>(1),
            new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private final java.util.concurrent.ThreadPoolExecutor reportsDetailNetwork = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.ArrayBlockingQueue<>(1),
            new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private HubClient reportsListClient;
    private int reportsListGeneration;
    private HubClient reportsDetailClient;
    private int reportsDetailGeneration;
    private final java.util.concurrent.ThreadPoolExecutor agManagerNetwork = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.ArrayBlockingQueue<>(1),
            new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private HubClient agManagerClient;
    private int agManagerGeneration;
    private final Runnable poll = () -> refresh(false);
    private WebView web;
    private ConnectionStore store;
    private ConnectionSpec spec;
    private HubClient client;
    private AppUpdates updates;
    private AppUpdateDownloads downloads;
    private boolean awaitingInstallPermission;
    private boolean foreground;
    private boolean ready;
    private boolean busy;
    private boolean subscriptionsRequested;
    private int generation;
    private int failures;
    private String subscriptionVersion;
    private Integer limitAccountPresentationRevision;
    private boolean limitAccountPresentationUnsupported;
    private String initialError = "";
    private String pendingNotificationAction;
    private JSONObject latestStats;
    private boolean historyBusy;
    private String pendingHistoryKey;
    private final ExecutorService certImportNetwork = Executors.newSingleThreadExecutor();
    private final java.util.LinkedHashMap<String, CertificateTrustPolicy.ParsedBundle> caDrafts = new java.util.LinkedHashMap<>();
    private String pendingCaPickRequestId;
    private String historyError = "";
    private static final int NOTIFICATION_REQUEST = 42;
    private static final int CA_PICK_REQUEST = 43;
    private static final int MAX_CA_DRAFTS = 4;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) pendingNotificationAction = savedInstanceState.getString("notificationAction");
        if (savedInstanceState != null) awaitingInstallPermission = savedInstanceState.getBoolean("installPermission");
        if (savedInstanceState != null) pendingCaPickRequestId = savedInstanceState.getString("caPickRequestId");
        store = new ConnectionStore(this);
        SessionNotifications.channels(this);
        try { spec = store.load(); }
        catch (Exception error) { initialError = "无法解密已保存的连接，请重新输入 Hub 和 secret"; }
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setBackgroundColor(Color.rgb(9, 12, 16));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        web.setWebViewClient(new LocalContentClient(this));
        web.addJavascriptInterface(new Bridge(), "HubNative");
        updates = new AppUpdates(this, this::emit);
        if (savedInstanceState != null) updates.restore(savedInstanceState);
        downloads = new AppUpdateDownloads(this, AppUpdates.installedVersion(this), this::emit, this::installUpdate);
        // Resize the WebView itself: its padding does not protect fixed CSS controls.
        FrameLayout viewport = new FrameLayout(this);
        viewport.setBackgroundColor(Color.rgb(9, 12, 16));
        viewport.setOnApplyWindowInsetsListener(MainActivity::applySafeArea);
        viewport.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(viewport);
        configureSystemBarAppearance();
        viewport.requestApplyInsets();
        try {
            web.loadUrl(LocalContentClient.START_URL);
        } catch (Exception error) {
            int paddingPx = Math.round(24 * getResources().getDisplayMetrics().density);
            android.widget.TextView message = new android.widget.TextView(this);
            message.setText(R.string.resources_unavailable);
            message.setTextColor(Color.rgb(203, 213, 225));
            message.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14f);
            message.setLineSpacing(0f, 1.4f);
            message.setGravity(android.view.Gravity.CENTER);
            message.setPadding(paddingPx, paddingPx, paddingPx, paddingPx);
            viewport.removeAllViews();
            viewport.addView(message, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
    }

    private void configureSystemBarAppearance() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(0, mask);
            }
        }
    }

    private static WindowInsets applySafeArea(View view, WindowInsets insets) {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            int safeTypes = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
            int handledTypes = safeTypes | WindowInsets.Type.ime();
            android.graphics.Insets safe = insets.getInsets(handledTypes);
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            // Still dispatch zeroed insets so WebView clears old safe areas / IME
            // without applying the parent's spacing a second time.
            return new WindowInsets.Builder(insets)
                    .setInsets(handledTypes, android.graphics.Insets.NONE)
                    .setInsetsIgnoringVisibility(safeTypes, android.graphics.Insets.NONE)
                    .setDisplayCutout(null)
                    .build();
        }
        int left = insets.getSystemWindowInsetLeft();
        int top = insets.getSystemWindowInsetTop();
        int right = insets.getSystemWindowInsetRight();
        int bottom = insets.getSystemWindowInsetBottom();
        if (android.os.Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
            android.view.DisplayCutout cutout = insets.getDisplayCutout();
            left = Math.max(left, cutout.getSafeInsetLeft());
            top = Math.max(top, cutout.getSafeInsetTop());
            right = Math.max(right, cutout.getSafeInsetRight());
            bottom = Math.max(bottom, cutout.getSafeInsetBottom());
        }
        view.setPadding(left, top, right, bottom);
        WindowInsets remaining = insets.replaceSystemWindowInsets(0, 0, 0, 0).consumeStableInsets();
        if (android.os.Build.VERSION.SDK_INT >= 28) remaining = remaining.consumeDisplayCutout();
        return remaining;
    }

    private void back() {
        if (!ready || web == null) { finish(); return; }
        web.evaluateJavascript("Boolean(window.handleBackNavigation && window.handleBackNavigation())", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    // Legacy devices only; API 33+ registers OnBackInvokedDispatcher in onCreate.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { back(); }

    private JSONObject event(String type) {
        JSONObject result = new JSONObject();
        try { result.put("type", type); } catch (Exception ignored) { }
        return result;
    }

    private void emit(JSONObject payload) {
        if (ready && !isDestroyed()) web.evaluateJavascript("window.receiveNative(" + JSONObject.quote(payload.toString()) + ")", null);
    }

    private void status(String state, String message) {
        try { emit(event("status").put("state", state).put("message", message)); } catch (Exception ignored) { }
        notificationState();
    }

    private JSONArray serializedProfiles() {
        JSONArray list = new JSONArray();
        try {
            for (ConnectionStore.ProfileSummary profile : store.listProfiles()) {
                JSONObject item = new JSONObject()
                        .put("id", profile.id)
                        .put("name", profile.name)
                        .put("url", profile.url)
                        .put("allowHttp", profile.allowHttp);
                if (profile.hasCustomCa) {
                    item.put("hasCustomCa", true)
                            .put("caFingerprint", profile.caFingerprint)
                            .put("caSubject", profile.caSubject)
                            .put("caNotAfter", profile.caNotAfter);
                }
                list.put(item);
            }
        } catch (Exception ignored) { }
        return list;
    }

    private String currentActiveProfileId() {
        if (spec == null) return "";
        try { return store.activeProfileId(); }
        catch (Exception ignored) { return ""; }
    }

    private void hubProfilesChanged() {
        try {
            emit(event("hubProfiles")
                    .put("activeHubProfileId", currentActiveProfileId())
                    .put("hubProfiles", serializedProfiles()));
        } catch (Exception ignored) { }
    }

    private void activateConnection(ConnectionSpec next) {
        caDrafts.clear();
        cancel();
        spec = next;
        failures = 0;
        subscriptionVersion = null;
        limitAccountPresentationRevision = null;
        limitAccountPresentationUnsupported = false;
        connectionChanged();
        MainActivity.this.refresh(true);
    }

    private void connectionChanged() {
        latestStats = null;
        historyError = "";
        historyBusy = false;
        pendingHistoryKey = null;
        try {
            JSONObject payload = event("connection")
                    .put("url", spec == null ? "" : spec.url)
                    .put("allowHttp", spec != null && spec.allowHttp)
                    .put("activeHubProfileId", currentActiveProfileId())
                    .put("hubProfiles", serializedProfiles())
                    .put("error", initialError);
            if (spec != null && spec.hasCustomCa()) {
                payload.put("hasCustomCa", true);
            }
            emit(payload);
            initialError = "";
            notificationState();
            approvalAlertsState();
        } catch (Exception ignored) { }
    }

    private void foregroundChanged() {
        try { emit(event("lifecycle").put("foreground", foreground)); } catch (Exception ignored) { }
    }

    private void limitsPrefsChanged() {
        try {
            String raw = getSharedPreferences("limits-prefs", MODE_PRIVATE).getString("prefs", "");
            JSONObject saved = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
            JSONObject payload = event("limitsPrefs")
                    .put("hideUncollected", saved.optBoolean("hideUncollected", true))
                    .put("showRemaining", saved.optBoolean("showRemaining", false))
                    .put("hiddenAccountHashes", sanitizeHiddenAccountHashes(saved.optJSONArray("hiddenAccountHashes")));
            emit(payload);
        } catch (Exception ignored) { }
    }

    private void displayPrefsChanged() {
        try {
            emit(DisplayPrefs.load(this).put("type", "displayPrefs"));
        } catch (Exception ignored) { }
    }

    private static org.json.JSONArray sanitizeHiddenAccountHashes(org.json.JSONArray raw) {
        org.json.JSONArray clean = new org.json.JSONArray();
        if (raw == null) return clean;
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        for (int i = 0; i < raw.length() && seen.size() < 256; i++) {
            String item = raw.optString(i, "");
            if (item.matches("[a-f0-9]{64}")) seen.add(item);
        }
        for (String hash : seen) clean.put(hash);
        return clean;
    }

    private void notificationState() {
        try {
            emit(event("notifications").put("enabled", SessionMonitorService.running() && new MonitorPreferences(this).enabled())
                    .put("permission", SessionNotifications.allowed(this)).put("message", SessionMonitorService.message(this))
                    .put("lastReadAt", SessionMonitorService.lastReadAt()));
        } catch (Exception ignored) { }
    }

    private void approvalAlertsState() {
        approvalAlertsState(null);
    }

    private void approvalAlertsState(org.json.JSONArray items) {
        try {
            ApprovalStore approvalStore = new ApprovalStore(this);
            boolean enabled = approvalStore.enabled();
            emit(event("approvalAlerts")
                    .put("enabled", enabled)
                    .put("permission", SessionNotifications.approvalsAllowed(this))
                    .put("status", approvalStore.status())
                    .put("message", approvalStore.message())
                    .put("items", enabled && items != null ? items : new org.json.JSONArray()));
        } catch (Exception ignored) { }
    }

    private void notificationAction(String action) {
        if ("approvals".equals(action)) {
            ApprovalStore approvalStore = new ApprovalStore(this);
            if (spec == null) {
                try { approvalStore.saveState(false, "error", "请先连接 Hub 再开启审批提醒"); } catch (Exception ignored) { }
                approvalAlertsState(); return;
            }
            if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                if (pendingNotificationAction != null) return;
                pendingNotificationAction = action;
                requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
                return;
            }
            if (!SessionNotifications.approvalsAllowed(this)) {
                try { approvalStore.saveState(false, "error", "请在系统通知设置中允许审批提醒通知"); } catch (Exception ignored) { }
                approvalAlertsState(); return;
            }
            try {
                approvalStore.saveState(true, "ok", "正在连接审批提醒…");
                startForegroundService(new Intent(this, SessionMonitorService.class).setAction(SessionMonitorService.ACTION_SYNC));
                approvalAlertsState();
                notificationState();
                main.postDelayed(() -> { approvalAlertsState(); notificationState(); }, 500);
                refresh(false);
            } catch (Exception error) {
                try { approvalStore.saveState(false, "error", "审批提醒服务未能启动，请重新开启并检查通知权限"); } catch (Exception ignored) { }
                approvalAlertsState();
            }
            return;
        }
        if ("enable".equals(action) && spec == null) {
            try { new MonitorPreferences(this).state(false, "请先连接 Hub 再开启完成提醒"); } catch (Exception ignored) { }
            notificationState(); return;
        }
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (pendingNotificationAction != null) return;
            pendingNotificationAction = action;
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
            return;
        }
        if (!SessionNotifications.allowed(this)) {
            try { new MonitorPreferences(this).state(false, "请在系统通知设置中允许完成提醒"); } catch (Exception ignored) { }
            notificationState(); return;
        }
        try {
            if ("test".equals(action)) SessionNotifications.test(this);
            else startForegroundService(new Intent(this, SessionMonitorService.class));
            main.postDelayed(this::notificationState, 500);
        } catch (Exception error) {
            try { new MonitorPreferences(this).state(false, "后台提醒未能启动，请重新开启并检查通知权限"); } catch (Exception ignored) { }
            notificationState();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_REQUEST) return;
        String action = pendingNotificationAction;
        pendingNotificationAction = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && action != null) notificationAction(action);
        else if ("approvals".equals(action)) {
            try { new ApprovalStore(this).saveState(false, "error", "通知权限未授权，可在系统通知设置中开启"); } catch (Exception ignored) { }
            approvalAlertsState();
        } else {
            try { new MonitorPreferences(this).state(false, "通知权限未授权，可在系统通知设置中开启"); } catch (Exception ignored) { }
            notificationState();
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (pendingNotificationAction != null) outState.putString("notificationAction", pendingNotificationAction);
        if (pendingCaPickRequestId != null) outState.putString("caPickRequestId", pendingCaPickRequestId);
        outState.putBoolean("installPermission", awaitingInstallPermission);
        if (updates != null) updates.save(outState);
        super.onSaveInstanceState(outState);
    }

    private void openNotificationSession() {
        if (!ready || spec == null) return;
        boolean openApprovals = getIntent().getBooleanExtra(ApprovalNotifications.EXTRA_OPEN_APPROVALS, false);
        if (openApprovals) {
            String approvalDest = getIntent().getStringExtra(ApprovalNotifications.EXTRA_APPROVAL_DESTINATION);
            getIntent().removeExtra(ApprovalNotifications.EXTRA_OPEN_APPROVALS);
            getIntent().removeExtra(ApprovalNotifications.EXTRA_APPROVAL_DESTINATION);
            if (!spec.trustFingerprint().equals(approvalDest)) {
                android.widget.Toast.makeText(this, "这条通知来自之前的 Hub 连接", android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            try { emit(event("openApprovalAlerts")); } catch (Exception ignored) { }
            cancel();
            refresh(false);
            return;
        }
        String key = getIntent().getStringExtra(SessionNotifications.EXTRA_KEY);
        String destination = getIntent().getStringExtra(SessionNotifications.EXTRA_DESTINATION);
        if (key == null || key.length() > 1024) return;
        getIntent().removeExtra(SessionNotifications.EXTRA_KEY);
        getIntent().removeExtra(SessionNotifications.EXTRA_DESTINATION);
        if (!spec.trustFingerprint().equals(destination)) {
            android.widget.Toast.makeText(this, "这条通知来自之前的 Hub 连接", android.widget.Toast.LENGTH_SHORT).show();
            return;
        }
        try { emit(event("openSession").put("key", key)); } catch (Exception ignored) { }
        cancel();
        refresh(false);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // The notification URI distinguishes PendingIntents, not Activity launches.
        // Keep the launch identity stable (including across recreation), and retain
        // only the latest routing extras until the WebView is ready to consume them.
        getIntent().putExtra(SessionNotifications.EXTRA_KEY, intent.getStringExtra(SessionNotifications.EXTRA_KEY));
        getIntent().putExtra(SessionNotifications.EXTRA_DESTINATION, intent.getStringExtra(SessionNotifications.EXTRA_DESTINATION));
        getIntent().putExtra(ApprovalNotifications.EXTRA_OPEN_APPROVALS, intent.getBooleanExtra(ApprovalNotifications.EXTRA_OPEN_APPROVALS, false));
        getIntent().putExtra(ApprovalNotifications.EXTRA_APPROVAL_DESTINATION, intent.getStringExtra(ApprovalNotifications.EXTRA_APPROVAL_DESTINATION));
        openNotificationSession();
    }

    private void cancel() {
        cancelConversation();
        cancelReports();
        cancelAntigravityManager();
        generation++;
        historyBusy = false;
        pendingHistoryKey = null;
        main.removeCallbacks(poll);
        if (client != null) client.cancel();
        busy = false;
    }

    private void refresh(boolean forceSubscriptions) {
        subscriptionsRequested |= forceSubscriptions;
        if (!foreground || !ready || spec == null || busy) return;
        main.removeCallbacks(poll);
        busy = true;
        int epoch = generation;
        String widgetBinding = store.binding();
        long startedAt = System.currentTimeMillis();
        ConnectionSpec destination = spec;
        HubClient request = new HubClient();
        client = request;
        boolean readSubscriptions = subscriptionsRequested;
        subscriptionsRequested = false;
        String previousVersion = subscriptionVersion;
        Integer previousPresRevision = limitAccountPresentationRevision;
        boolean skipPresentation = limitAccountPresentationUnsupported;
        status("loading", "正在同步…");
        network.execute(() -> {
            try {
                JSONObject stats = request.get(destination, "/api/stats");
                if (stats.optJSONObject("periods") == null || stats.optJSONArray("devices") == null) {
                    throw new HubClient.HubError(200, "响应不是有效的 Hub 统计数据");
                }
                String marker = stats.has("subscriptionsUpdatedAt") ? stats.getString("subscriptionsUpdatedAt") : previousVersion;
                JSONObject subscriptions = null;
                String subscriptionError = "";
                if (readSubscriptions || (marker != null && !marker.equals(previousVersion))) {
                    try {
                        subscriptions = request.get(destination, "/api/subscriptions");
                        if (subscriptions.optJSONArray("subscriptions") == null) throw new IllegalStateException("Invalid subscriptions");
                    } catch (Exception error) {
                        subscriptionError = error instanceof HubClient.HubError ? error.getMessage() : "订阅读取失败，可点击刷新重试";
                    }
                }
                JSONObject subscriptionData = subscriptions;
                String subscriptionMessage = subscriptionError;
                JSONObject presentationData = null;
                Integer fetchedPresentationRevision = null;
                boolean markPresentationUnsupported = false;
                JSONObject syncRevisions = stats.optJSONObject("syncSettingsRevisions");
                if (!skipPresentation && syncRevisions != null && syncRevisions.has("limitAccountPresentation")) {
                    int presRev = syncRevisions.optInt("limitAccountPresentation", -1);
                    if (presRev == 0) {
                        if (previousPresRevision == null || previousPresRevision != 0) {
                            presentationData = new JSONObject();
                            fetchedPresentationRevision = 0;
                        }
                    } else if (presRev > 0 && (previousPresRevision == null || presRev != previousPresRevision)) {
                        try {
                            JSONObject presBody = request.limitAccountPresentation(destination);
                            if (presBody.optBoolean("ok", false)) {
                                JSONObject presValue = presBody.optJSONObject("value");
                                presentationData = presValue != null ? presValue : new JSONObject();
                                fetchedPresentationRevision = presBody.has("revision")
                                        ? presBody.optInt("revision", presRev)
                                        : presRev;
                            }
                        } catch (HubClient.HubError error) {
                            if (error.status == 401 || error.status == 403) throw error;
                            if (error.status == 400 || error.status == 404) markPresentationUnsupported = true;
                        } catch (Exception ignored) { }
                    }
                }
                final JSONObject finalPresentationData = presentationData;
                final Integer finalPresentationRevision = fetchedPresentationRevision;
                final boolean finalMarkPresentationUnsupported = markPresentationUnsupported;
                // Use the provider's observation time, never the polling clock.
                // Persistence failures must not fail a healthy Hub read.
                String persistenceError = "";
                try (LimitsHistoryStore history = new LimitsHistoryStore(MainActivity.this, destination.fingerprint())) {
                    history.record(stats, System.currentTimeMillis());
                } catch (Exception problem) { persistenceError = "额度历史未能保存，请检查可用存储空间后刷新重试"; }
                String historyMessage = persistenceError;
                ApprovalStore approvalStore = new ApprovalStore(MainActivity.this);
                boolean fetchApprovals = approvalStore.enabled();
                org.json.JSONArray approvalItems = null;
                String approvalStatus = approvalStore.status();
                String approvalMessage = approvalStore.message();
                if (fetchApprovals) {
                    try {
                        JSONObject approvalsBody = request.approvalAlerts(destination);
                        if (approvalsBody.optBoolean("ok", false) && approvalsBody.optJSONArray("alerts") != null) {
                            approvalItems = approvalsBody.getJSONArray("alerts");
                            approvalStatus = "ok";
                            approvalMessage = approvalItems.length() > 0
                                    ? ("待电脑端确认 " + approvalItems.length() + " 条")
                                    : "审批提醒在线 · 等待需要确认的操作";
                        } else {
                            String err = approvalsBody.optString("error", "disabled");
                            if ("disabled".equals(err)) {
                                approvalStatus = "disabled";
                                approvalMessage = "Hub 端未开启审批提醒（请在桌面端同步设置或 Hub 中开启）";
                            } else {
                                approvalStatus = "error";
                                approvalMessage = "Hub 返回异常状态（" + err + "）";
                            }
                            approvalItems = new org.json.JSONArray();
                        }
                    } catch (HubClient.HubError error) {
                        if (error.status == 401 || error.status == 403) throw error;
                        if (error.status == 404) {
                            approvalStatus = "unsupported";
                            approvalMessage = "当前 Hub 尚不支持审批提醒（请升级 Hub 或开启审批提醒）";
                        } else {
                            approvalStatus = "error";
                            approvalMessage = error.getMessage();
                        }
                        approvalItems = new org.json.JSONArray();
                    } catch (Exception error) {
                        approvalStatus = "error";
                        approvalMessage = "审批提醒拉取失败：" + (error.getMessage() == null ? "网络错误" : error.getMessage());
                        approvalItems = new org.json.JSONArray();
                    }
                }
                final boolean fetchedApprovals = fetchApprovals;
                final org.json.JSONArray finalApprovalItems = approvalItems;
                final String finalApprovalStatus = approvalStatus;
                final String finalApprovalMessage = approvalMessage;
                main.post(() -> {
                    if (epoch != generation || !foreground) return;
                    busy = false;
                    failures = 0;
                    latestStats = stats;
                    historyError = historyMessage;
                    if (UsageWidgetProvider.hasAnyWidgets(MainActivity.this)) {
                        UsageWidgetStore.publish(MainActivity.this, widgetBinding, stats, System.currentTimeMillis(), startedAt);
                    }
                    try {
                        emit(event("stats").put("data", stats).put("fetchedAt", System.currentTimeMillis()).put("historyError", historyError));
                        if (subscriptionData != null) {
                            subscriptionVersion = marker;
                            emit(event("subscriptions").put("data", subscriptionData));
                        } else if (!subscriptionMessage.isEmpty()) {
                            // Retry a failed version read on explicit page entry/manual refresh,
                            // rather than adding another network request on every stats poll.
                            subscriptionVersion = marker;
                            emit(event("subscriptionError").put("message", subscriptionMessage));
                        }
                        if (finalMarkPresentationUnsupported) {
                            limitAccountPresentationUnsupported = true;
                        } else if (finalPresentationData != null) {
                            limitAccountPresentationRevision = finalPresentationRevision;
                            emit(event("limitAccountPresentation").put("data", finalPresentationData));
                        }
                        if (fetchedApprovals && approvalStore.enabled()) {
                            approvalStore.saveState(true, finalApprovalStatus, finalApprovalMessage);
                            ApprovalNotifications.notifyNew(MainActivity.this, destination.trustFingerprint(), finalApprovalItems, System.currentTimeMillis(), approvalStore);
                            approvalAlertsState(finalApprovalItems);
                        }
                    } catch (Exception ignored) { }
                    status("online", "已连接 · 每 5 秒更新");
                    main.postDelayed(poll, subscriptionsRequested ? 0 : 5000);
                });
            } catch (Exception error) {
                String message = error instanceof HubClient.HubError ? error.getMessage()
                        : error instanceof javax.net.ssl.SSLException
                                ? (destination.hasCustomCa()
                                        ? "TLS 证书验证失败：请确认导入了正确的 Hub CA 证书、未过期且包含当前域名或 IP（SAN）"
                                        : "TLS 证书验证失败：若使用自签名证书，请在连接设置中导入 CA 证书，并检查设备时间")
                        : "连接失败，请检查网络、Hub 地址和服务状态";
                main.post(() -> {
                    if (epoch != generation || !foreground) return;
                    busy = false;
                    failures = Math.min(failures + 1, 4);
                    if (UsageWidgetProvider.hasAnyWidgets(MainActivity.this)) {
                        UsageWidgetStore.failed(MainActivity.this, widgetBinding, startedAt, error instanceof HubClient.HubError
                                && (((HubClient.HubError) error).status == 401 || ((HubClient.HubError) error).status == 403));
                    }
                    status("offline", message);
                    main.postDelayed(poll, Math.min(60000, 5000L * (1 << failures)));
                });
            }
        });
    }

    private final class Bridge {
        @JavascriptInterface public void ready() {
            main.post(() -> {
                ready = true; foregroundChanged(); limitsPrefsChanged(); displayPrefsChanged(); connectionChanged(); openNotificationSession(); MainActivity.this.refresh(true);
                if (foreground) updates.resume(); else updates.send();
                downloads.send();
            });
        }
        @JavascriptInterface public void saveDisplayPrefs(String serialized) {
            if (serialized == null || serialized.length() > 8192) return;
            main.post(() -> {
                if (DisplayPrefs.save(MainActivity.this, serialized)) {
                    displayPrefsChanged();
                    if (latestStats != null && spec != null) {
                        long now = System.currentTimeMillis();
                        UsageWidgetStore.publish(MainActivity.this, store.binding(), latestStats, now, now);
                    }
                }
            });
        }
        @JavascriptInterface public void saveLimitsPrefs(String serialized) {
            if (serialized == null || serialized.length() > 32768) return;
            main.post(() -> {
                try {
                    JSONObject parsed = new JSONObject(serialized);
                    JSONObject clean = new JSONObject()
                            .put("hideUncollected", parsed.optBoolean("hideUncollected", true))
                            .put("showRemaining", parsed.optBoolean("showRemaining", false))
                            .put("hiddenAccountHashes", sanitizeHiddenAccountHashes(parsed.optJSONArray("hiddenAccountHashes")));
                    getSharedPreferences("limits-prefs", MODE_PRIVATE).edit().putString("prefs", clean.toString()).commit();
                } catch (Exception ignored) { }
            });
        }
        private interface ProfileMutation {
            ConnectionSpec apply() throws Exception;
        }

        private void applyProfileMutation(ProfileMutation mutation, String genericError) {
            main.post(() -> {
                try {
                    ConnectionSpec next = mutation.apply();
                    SessionMonitorService.stop(MainActivity.this, "连接已变更，请重新开启完成提醒", true);
                    activateConnection(next);
                } catch (IllegalArgumentException error) {
                    try { emit(event("formError").put("message", error.getMessage())); } catch (Exception ignored) { }
                } catch (Exception error) {
                    try { emit(event("formError").put("message", genericError)); } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface public void connect(String address, String secret, boolean allowHttp) {
            applyProfileMutation(() -> {
                ConnectionSpec candidate = new ConnectionSpec(address, secret, allowHttp);
                store.save(candidate);
                return candidate;
            }, "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void connectWithTls(String address, String secret, boolean allowHttp, String caDraftToken) {
            applyProfileMutation(() -> {
                String caPem = resolveCaDraftPem(caDraftToken);
                ConnectionSpec candidate = new ConnectionSpec(address, secret, allowHttp, caPem);
                store.save(candidate);
                return candidate;
            }, "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void selectHubProfile(String id) {
            applyProfileMutation(() -> store.selectProfile(id), "无法读取已保存的连接，请重新输入 Hub 和密钥");
        }

        @JavascriptInterface public void addHubProfile(String name, String address, String secret, boolean allowHttp) {
            applyProfileMutation(() -> store.addProfile(name, address, secret, allowHttp), "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void addHubProfileWithTls(String name, String address, String secret, boolean allowHttp, String caDraftToken) {
            applyProfileMutation(() -> {
                String caPem = resolveCaDraftPem(caDraftToken);
                return store.addProfile(name, address, secret, allowHttp, caPem);
            }, "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void saveHubProfile(String id, String name, String address, String secret, boolean allowHttp) {
            applyProfileMutation(() -> store.saveProfile(id, name, address, secret, allowHttp), "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void saveHubProfileWithTls(String id, String name, String address, String secret, boolean allowHttp, String caMode, String caDraftToken) {
            applyProfileMutation(() -> {
                String mode = caMode == null || caMode.trim().isEmpty() ? "keep" : caMode.trim();
                String caPem = "replace".equals(mode) ? resolveRequiredCaDraftPem(caDraftToken) : "";
                return store.saveProfile(id, name, address, secret, allowHttp, mode, caPem);
            }, "无法加密保存连接，请检查设备存储后重试");
        }

        @JavascriptInterface public void pickCaCertificate(String requestId) {
            if (requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
            main.post(() -> launchCaPicker(requestId));
        }

        @JavascriptInterface public void validateCaCertificatePem(String pem, String requestId) {
            if (requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
            if (pem != null && pem.length() > CertificateTrustPolicy.MAX_CERT_BYTES * 2) {
                main.post(() -> emitCaDraftError(requestId, "证书内容超过 24 KiB 大小限制"));
                return;
            }
            main.post(() -> validatePastedCaPem(pem == null ? "" : pem, requestId));
        }

        @JavascriptInterface public void clearCaCertificateDraft(String draftToken) {
            if (draftToken == null || draftToken.length() > 80) return;
            main.post(() -> caDrafts.remove(draftToken));
        }

        @JavascriptInterface public void deleteHubProfile(String id) {
            main.post(() -> {
                boolean wasActive;
                try {
                    if (id != null && !id.isEmpty() && id.equals(currentActiveProfileId())) {
                        SessionMonitorService.stop(MainActivity.this, "Hub 已断开，完成提醒已关闭", true);
                    }
                    wasActive = store.deleteProfile(id);
                } catch (Exception error) {
                    try { emit(event("formError").put("message", "无法删除已保存的连接，请检查设备存储")); } catch (Exception ignored) { }
                    return;
                }
                if (wasActive) {
                    cancel();
                    spec = null;
                    subscriptionVersion = null;
                    connectionChanged();
                } else {
                    hubProfilesChanged();
                }
            });
        }
        @JavascriptInterface public void refresh() { main.post(() -> MainActivity.this.refresh(true)); }
        @JavascriptInterface public void subscriptions() { main.post(() -> MainActivity.this.refresh(true)); }
        @JavascriptInterface public void quotaHistory(String key) { main.post(() -> readQuotaHistory(key)); }
        @JavascriptInterface public void conversation(String deviceId, String key, String cursor, String requestId) {
            main.post(() -> readConversation(deviceId, key, cursor, requestId));
        }
        @JavascriptInterface public void cancelConversation() { main.post(() -> MainActivity.this.cancelConversation()); }
        @JavascriptInterface public void listReports(String granularity, int limit, String requestId) {
            main.post(() -> readReportsList(granularity, limit, requestId));
        }
        @JavascriptInterface public void getReport(String granularity, String periodKey, String requestId) {
            main.post(() -> readReportDetail(granularity, periodKey, requestId));
        }
        @JavascriptInterface public void cancelReports() { main.post(() -> MainActivity.this.cancelReports()); }
        @JavascriptInterface public void queryAntigravityManager(String requestId) {
            main.post(() -> MainActivity.this.queryAntigravityManager(requestId));
        }
        @JavascriptInterface public void cancelAntigravityManager() {
            main.post(() -> MainActivity.this.cancelAntigravityManager());
        }
        @JavascriptInterface public boolean copyText(String text) {
            if (text == null || text.isEmpty() || text.length() > 256 * 1024) return false;
            java.util.concurrent.atomic.AtomicBoolean copied = new java.util.concurrent.atomic.AtomicBoolean(false);
            java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
            boolean posted = main.post(() -> {
                try {
                    if (!foreground || isDestroyed()) return;
                    android.content.ClipboardManager manager = getSystemService(android.content.ClipboardManager.class);
                    if (manager == null) return;
                    manager.setPrimaryClip(android.content.ClipData.newPlainText("Token Monitor", text));
                    copied.set(true);
                } catch (Exception ignored) {
                } finally {
                    done.countDown();
                }
            });
            if (!posted) return false;
            try {
                return done.await(1, java.util.concurrent.TimeUnit.SECONDS) && copied.get();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        @JavascriptInterface public void checkForUpdates() { main.post(() -> updates.check(true)); }
        @JavascriptInterface public void automaticUpdates(boolean enabled) { main.post(() -> updates.automatic(enabled)); }
        @JavascriptInterface public void dismissAppUpdatePrompt() { main.post(() -> updates.dismissPrompt()); }
        @JavascriptInterface public void downloadUpdate() {
            main.post(() -> { if (foreground) downloads.start(updates.candidate()); });
        }
        @JavascriptInterface public void installUpdate() { main.post(() -> { if (foreground) downloads.requestInstall(); }); }
        @JavascriptInterface public void cancelUpdateDownload() { main.post(() -> downloads.cancel()); }
        @JavascriptInterface public void monitor(boolean enabled) {
            main.post(() -> {
                if (enabled) notificationAction("enable");
                else {
                    try {
                        ApprovalStore approvalStore = new ApprovalStore(MainActivity.this);
                        if (approvalStore.enabled() && SessionMonitorService.running()) {
                            new MonitorPreferences(MainActivity.this).state(false, "完成提醒已关闭");
                            startService(new Intent(MainActivity.this, SessionMonitorService.class).setAction(SessionMonitorService.ACTION_SYNC));
                        } else {
                            SessionMonitorService.stop(MainActivity.this, "完成提醒已关闭", false);
                        }
                    } catch (Exception ignored) { }
                    notificationState();
                    approvalAlertsState();
                }
            });
        }
        @JavascriptInterface public void approvalAlerts(boolean enabled) {
            main.post(() -> {
                if (enabled) {
                    notificationAction("approvals");
                    return;
                }
                try {
                    ApprovalStore approvalStore = new ApprovalStore(MainActivity.this);
                    approvalStore.saveState(false, "off", "审批提醒未开启");
                    ApprovalNotifications.cancelAll(MainActivity.this);
                    MonitorPreferences monitorPrefs = new MonitorPreferences(MainActivity.this);
                    if (monitorPrefs.enabled() && SessionMonitorService.running()) {
                        startService(new Intent(MainActivity.this, SessionMonitorService.class).setAction(SessionMonitorService.ACTION_SYNC));
                    } else if (!monitorPrefs.enabled()) {
                        SessionMonitorService.stop(MainActivity.this, monitorPrefs.message(), false);
                    }
                } catch (Exception ignored) { }
                approvalAlertsState();
                notificationState();
            });
        }
        @JavascriptInterface public void testNotification() { main.post(() -> notificationAction("test")); }
        @JavascriptInterface public void notificationSettings() {
            main.post(() -> startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName())));
        }
        @JavascriptInterface public void disconnect() {
            main.post(() -> {
                try { SessionMonitorService.stop(MainActivity.this, "Hub 已断开，完成提醒已关闭", true); store.disconnectActive(); }
                catch (Exception error) { status("offline", "无法断开或清理当前连接，请检查设备存储"); return; }
                caDrafts.clear();
                cancel();
                spec = null;
                subscriptionVersion = null;
                connectionChanged();
            });
        }
    }

    private String resolveCaDraftPem(String draftToken) {
        if (draftToken == null || draftToken.trim().isEmpty()) return "";
        return resolveRequiredCaDraftPem(draftToken);
    }

    private String resolveRequiredCaDraftPem(String draftToken) {
        String clean = draftToken == null ? "" : draftToken.trim();
        CertificateTrustPolicy.ParsedBundle bundle = clean.isEmpty() ? null : caDrafts.get(clean);
        if (bundle == null) {
            throw new IllegalArgumentException("导入的 CA 证书已失效，请重新选择或粘贴");
        }
        return bundle.canonicalPem;
    }

    private String putCaDraft(CertificateTrustPolicy.ParsedBundle bundle) {
        while (caDrafts.size() >= MAX_CA_DRAFTS) {
            String oldest = caDrafts.keySet().iterator().next();
            caDrafts.remove(oldest);
        }
        String token = java.util.UUID.randomUUID().toString();
        caDrafts.put(token, bundle);
        return token;
    }

    private void emitCaDraftSuccess(String requestId, String draftToken, CertificateTrustPolicy.ParsedBundle bundle) {
        try {
            JSONObject cert = new JSONObject()
                    .put("sha256", bundle.fingerprintSha256)
                    .put("subject", bundle.subject)
                    .put("issuer", bundle.issuer)
                    .put("notBefore", bundle.notBeforeMs)
                    .put("notAfter", bundle.notAfterMs)
                    .put("certCount", bundle.certCount)
                    .put("isCa", bundle.isCa);
            emit(event("caCertDraft")
                    .put("requestId", requestId)
                    .put("ok", true)
                    .put("draftToken", draftToken)
                    .put("cert", cert));
        } catch (Exception ignored) { }
    }

    private void emitCaDraftError(String requestId, String message) {
        try {
            emit(event("caCertDraft")
                    .put("requestId", requestId)
                    .put("ok", false)
                    .put("error", message == null ? "证书解析失败" : message));
        } catch (Exception ignored) { }
    }

    private void emitCaDraftCancelled(String requestId) {
        try {
            emit(event("caCertDraft")
                    .put("requestId", requestId)
                    .put("ok", false)
                    .put("cancelled", true));
        } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private void launchCaPicker(String requestId) {
        if (!foreground || isDestroyed()) return;
        pendingCaPickRequestId = requestId;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/x-x509-ca-cert",
                "application/x-pem-file",
                "application/pkix-cert",
                "application/octet-stream",
                "text/plain"
        });
        try {
            startActivityForResult(intent, CA_PICK_REQUEST);
        } catch (Exception error) {
            pendingCaPickRequestId = null;
            emitCaDraftError(requestId, "无法打开系统文件选择器");
        }
    }

    private void validatePastedCaPem(String pem, String requestId) {
        certImportNetwork.execute(() -> {
            try {
                byte[] bytes = pem.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                CertificateTrustPolicy.ParsedBundle parsed = CertificateTrustPolicy.parseForImport(bytes, new java.util.Date());
                main.post(() -> {
                    if (isDestroyed()) return;
                    String token = putCaDraft(parsed);
                    emitCaDraftSuccess(requestId, token, parsed);
                });
            } catch (IllegalArgumentException error) {
                String msg = error.getMessage();
                main.post(() -> {
                    if (!isDestroyed()) emitCaDraftError(requestId, msg);
                });
            } catch (Exception error) {
                main.post(() -> {
                    if (!isDestroyed()) emitCaDraftError(requestId, "无法解析粘贴的 PEM 证书");
                });
            }
        });
    }

    private static byte[] readBoundedStream(java.io.InputStream input, int maxBytes) throws java.io.IOException {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > maxBytes) {
                throw new IllegalArgumentException("证书文件超过 24 KiB 大小限制");
            }
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CA_PICK_REQUEST) return;
        String requestId = pendingCaPickRequestId != null ? pendingCaPickRequestId : "saf";
        pendingCaPickRequestId = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            emitCaDraftCancelled(requestId);
            return;
        }
        android.net.Uri uri = data.getData();
        certImportNetwork.execute(() -> {
            try (java.io.InputStream input = getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalArgumentException("无法读取所选证书文件");
                byte[] raw = readBoundedStream(input, CertificateTrustPolicy.MAX_CERT_BYTES);
                CertificateTrustPolicy.ParsedBundle parsed = CertificateTrustPolicy.parseForImport(raw, new java.util.Date());
                main.post(() -> {
                    if (isDestroyed()) return;
                    String token = putCaDraft(parsed);
                    emitCaDraftSuccess(requestId, token, parsed);
                });
            } catch (IllegalArgumentException error) {
                String msg = error.getMessage();
                main.post(() -> {
                    if (!isDestroyed()) emitCaDraftError(requestId, msg);
                });
            } catch (Exception error) {
                main.post(() -> {
                    if (!isDestroyed()) emitCaDraftError(requestId, "无法读取所选证书文件");
                });
            }
        });
    }

    private void cancelConversation() {
        conversationGeneration++;
        conversationNetwork.getQueue().clear();
        if (conversationClient != null) conversationClient.cancel();
        conversationClient = null;
    }

    private void readConversation(String deviceId, String key, String cursor, String requestId) {
        cancelConversation();
        if (!foreground || spec == null || latestStats == null || requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
        try { spec.conversationEndpoint(deviceId, key, cursor); } catch (IllegalArgumentException error) { return; }
        org.json.JSONArray devices = latestStats.optJSONArray("devices");
        boolean found = false;
        for (int i = 0; devices != null && i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device == null || !deviceId.equals(device.optString("deviceId")) || device.optBoolean("stale")) continue;
            JSONObject periods = device.optJSONObject("periods");
            for (String period : new String[] {"today", "month"}) {
                JSONObject snapshot = periods == null ? null : periods.optJSONObject(period);
                JSONObject sessions = snapshot == null ? null : snapshot.optJSONObject("sessions");
                if (sessions != null && sessions.optJSONObject(key) != null) found = true;
            }
        }
        if (!found) {
            JSONObject page = new JSONObject();
            try { page.put("error", "device_offline"); } catch (Exception ignored) { }
            sendConversation(deviceId, key, cursor, requestId, page);
            return;
        }
        int epoch = generation;
        int queryEpoch = conversationGeneration;
        ConnectionSpec destination = spec;
        HubClient request = new HubClient();
        conversationClient = request;
        conversationNetwork.execute(() -> {
            JSONObject result;
            try { result = request.conversation(destination, deviceId, key, cursor); }
            catch (Exception error) {
                result = new JSONObject();
                try { result.put("error", error instanceof HubClient.HubError && ((HubClient.HubError) error).status == 404
                        ? "unsupported_hub" : error instanceof HubClient.HubError && (((HubClient.HubError) error).status == 401 || ((HubClient.HubError) error).status == 403)
                        ? "unauthorized" : "read_failed"); } catch (Exception ignored) { }
            }
            JSONObject payload = result;
            main.post(() -> {
                if (epoch != generation || queryEpoch != conversationGeneration || !foreground) return;
                conversationClient = null;
                sendConversation(deviceId, key, cursor, requestId, payload);
            });
        });
    }

    private void sendConversation(String deviceId, String key, String cursor, String requestId, JSONObject page) {
        try { emit(event("conversation").put("deviceId", deviceId).put("key", key).put("cursor", cursor)
                .put("requestId", requestId).put("page", page)); } catch (Exception ignored) { }
    }

    private void cancelReportsList() {
        reportsListGeneration++;
        reportsListNetwork.getQueue().clear();
        if (reportsListClient != null) reportsListClient.cancel();
        reportsListClient = null;
    }

    private void cancelReportsDetail() {
        reportsDetailGeneration++;
        reportsDetailNetwork.getQueue().clear();
        if (reportsDetailClient != null) reportsDetailClient.cancel();
        reportsDetailClient = null;
    }

    private void cancelReports() {
        cancelReportsList();
        cancelReportsDetail();
    }

    private void cancelAntigravityManager() {
        agManagerGeneration++;
        agManagerNetwork.getQueue().clear();
        if (agManagerClient != null) agManagerClient.cancel();
        agManagerClient = null;
    }

    private void queryAntigravityManager(String requestId) {
        cancelAntigravityManager();
        if (!foreground || spec == null || requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
        int epoch = generation;
        int queryEpoch = agManagerGeneration;
        ConnectionSpec destination = spec;
        HubClient request = new HubClient();
        agManagerClient = request;
        agManagerNetwork.execute(() -> {
            JSONObject payload;
            try {
                JSONObject data = request.antigravityManager(destination);
                payload = event("antigravityManagerResult");
                payload.put("requestId", requestId);
                payload.put("payload", data);
            } catch (Exception error) {
                payload = event("antigravityManagerError");
                try {
                    payload.put("requestId", requestId);
                    payload.put("code", mapReportHubError(error));
                    payload.put("message", error.getMessage() == null ? "读取 Antigravity 账号池失败" : error.getMessage());
                } catch (Exception ignored) { }
            }
            JSONObject finalPayload = payload;
            main.post(() -> {
                if (epoch != generation || queryEpoch != agManagerGeneration || !foreground) return;
                agManagerClient = null;
                emit(finalPayload);
            });
        });
    }

    private static String mapReportHubError(Exception error) {
        if (error instanceof HubClient.HubError) {
            int status = ((HubClient.HubError) error).status;
            if (status == 404) return "unsupported_hub";
            if (status == 401 || status == 403) return "unauthorized";
        }
        return "read_failed";
    }

    private void readReportsList(String granularity, int limit, String requestId) {
        cancelReportsList();
        if (!foreground || spec == null || requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
        String cleanGranularity = granularity == null ? "" : granularity.trim();
        try { spec.reportsListEndpoint(cleanGranularity, limit); } catch (IllegalArgumentException error) { return; }
        int epoch = generation;
        int queryEpoch = reportsListGeneration;
        ConnectionSpec destination = spec;
        HubClient request = new HubClient();
        reportsListClient = request;
        reportsListNetwork.execute(() -> {
            JSONObject payload = event("reportsList");
            try {
                payload.put("granularity", cleanGranularity);
                payload.put("requestId", requestId);
                JSONObject data = request.reportsList(destination, cleanGranularity, limit);
                payload.put("data", data);
            } catch (Exception error) {
                try {
                    payload.put("granularity", cleanGranularity);
                    payload.put("requestId", requestId);
                    payload.put("error", mapReportHubError(error));
                } catch (Exception ignored) { }
            }
            main.post(() -> {
                if (epoch != generation || queryEpoch != reportsListGeneration || !foreground) return;
                reportsListClient = null;
                emit(payload);
            });
        });
    }

    private void readReportDetail(String granularity, String periodKey, String requestId) {
        cancelReportsDetail();
        if (!foreground || spec == null || requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) return;
        String cleanGranularity = granularity == null ? "" : granularity.trim();
        String cleanKey = periodKey == null || periodKey.trim().isEmpty() ? "current" : periodKey.trim();
        try { spec.reportDetailEndpoint(cleanGranularity, cleanKey, "both"); } catch (IllegalArgumentException error) { return; }
        int epoch = generation;
        int queryEpoch = reportsDetailGeneration;
        ConnectionSpec destination = spec;
        HubClient request = new HubClient();
        reportsDetailClient = request;
        reportsDetailNetwork.execute(() -> {
            JSONObject payload = event("reportDetail");
            try {
                payload.put("granularity", cleanGranularity);
                payload.put("periodKey", cleanKey);
                payload.put("requestId", requestId);
                JSONObject data = request.reportDetail(destination, cleanGranularity, cleanKey);
                payload.put("data", data);
            } catch (Exception error) {
                try {
                    payload.put("granularity", cleanGranularity);
                    payload.put("periodKey", cleanKey);
                    payload.put("requestId", requestId);
                    payload.put("error", mapReportHubError(error));
                } catch (Exception ignored) { }
            }
            main.post(() -> {
                if (epoch != generation || queryEpoch != reportsDetailGeneration || !foreground) return;
                reportsDetailClient = null;
                emit(payload);
            });
        });
    }

    private void readQuotaHistory(String key) {
        if (!foreground || spec == null || latestStats == null || key == null || !key.matches("[a-f0-9]{64}")) return;
        if (historyBusy) { pendingHistoryKey = key; return; }
        JSONObject provider = historyProvider(latestStats.optJSONObject("limits"), key);
        org.json.JSONArray devices = latestStats.optJSONArray("devices");
        for (int i = 0; provider == null && devices != null && i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device != null) provider = historyProvider(device.optJSONObject("limits"), key);
        }
        // Only identities from the current native snapshot may be queried.
        if (provider == null) return;
        JSONObject selected = provider;
        String scope = spec.fingerprint();
        String persistenceError = historyError;
        int epoch = generation;
        historyBusy = true;
        network.execute(() -> {
            JSONObject result;
            try (LimitsHistoryStore history = new LimitsHistoryStore(MainActivity.this, scope)) {
                result = history.query(selected, System.currentTimeMillis());
                result.put("error", persistenceError);
            } catch (Exception problem) {
                result = event("quotaHistory");
                try { result.put("key", key).put("error", "额度历史暂不可用，请检查可用存储空间后重试"); } catch (Exception ignored) { }
            }
            JSONObject payload = result;
            main.post(() -> {
                if (epoch != generation || !foreground) return;
                historyBusy = false;
                try { emit(payload.put("type", "quotaHistory")); } catch (Exception ignored) { }
                String pending = pendingHistoryKey;
                pendingHistoryKey = null;
                if (pending != null) readQuotaHistory(pending);
            });
        });
    }

    private static JSONObject historyProvider(JSONObject limits, String key) {
        org.json.JSONArray providers = limits == null ? null : limits.optJSONArray("providers");
        for (int i = 0; providers != null && i < providers.length(); i++) {
            JSONObject provider = providers.optJSONObject(i);
            if (provider != null && key.equals(provider.optString("androidHistoryKey"))) return provider;
        }
        return null;
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) web.onResume();
        foregroundChanged();
        try {
            MonitorPreferences monitoring = new MonitorPreferences(this);
            if (!SessionMonitorService.running() && monitoring.enabled()) monitoring.state(false, "后台监控已中断，请重新开启完成提醒");
            ApprovalStore approvals = new ApprovalStore(this);
            if (!SessionMonitorService.running() && approvals.enabled()) {
                approvals.saveState(false, "error", "后台监控已中断，请重新开启审批提醒");
                ApprovalNotifications.cancelAll(this);
            }
        } catch (Exception ignored) { }
        notificationState();
        approvalAlertsState();
        refresh(false);
        if (ready && updates != null) updates.resume();
        if (downloads != null) {
            downloads.resume();
            if (awaitingInstallPermission) {
                awaitingInstallPermission = false;
                if (getPackageManager().canRequestPackageInstalls()) downloads.requestInstall();
                else downloads.permissionDenied();
            }
        }
    }
    @Override protected void onStop() {
        foreground = false;
        if (updates != null) updates.pause();
        cancel();
        foregroundChanged();
        if (web != null) web.onPause();
        super.onStop();
    }
    @Override protected void onDestroy() {
        caDrafts.clear();
        cancel();
        network.shutdownNow();
        certImportNetwork.shutdownNow();
        conversationNetwork.shutdownNow();
        reportsListNetwork.shutdownNow();
        reportsDetailNetwork.shutdownNow();
        agManagerNetwork.shutdownNow();
        if (updates != null) updates.close();
        if (downloads != null) downloads.close();
        if (web != null) { web.removeJavascriptInterface("HubNative"); web.destroy(); }
        super.onDestroy();
    }

    private void installUpdate(java.io.File file) {
        if (!foreground || isDestroyed()) return;
        try {
            if (!getPackageManager().canRequestPackageInstalls()) {
                downloads.permissionRequired();
                awaitingInstallPermission = true;
                startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        android.net.Uri.parse("package:" + getPackageName())));
                return;
            }
            startActivity(updateInstallIntent(this, file));
            downloads.installerOpened();
            updates.dismissPrompt();
        } catch (Exception problem) { awaitingInstallPermission = false; downloads.installerFailed(); }
    }

    static Intent updateInstallIntent(android.content.Context context, java.io.File file) {
        android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(context, context.getPackageName() + ".updates", file);
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(android.content.ClipData.newRawUri("Token Monitor update", uri));
        return intent;
    }
}
