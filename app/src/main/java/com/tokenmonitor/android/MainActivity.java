package com.tokenmonitor.android;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
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
    private final java.util.concurrent.ThreadPoolExecutor fixedRangeNetwork = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.ArrayBlockingQueue<>(1),
            new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private HubClient fixedRangeClient;
    private int fixedRangeGeneration;
    private final Object fixedRangeCacheLock = new Object();
    private final java.util.LinkedHashMap<String, JSONObject> fixedRangeSliceCache = new java.util.LinkedHashMap<>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, JSONObject> eldest) {
            return size() > 32;
        }
    };
    private String cachedDevicesHistoryKey = "";
    private JSONArray cachedDevicesHistory;
    private final java.util.Set<String> admittedFixedRangeSessionPairs = java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<>());
    private final Runnable poll = () -> refresh(false);
    private FrameLayout viewport;
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
    private boolean lastImeVisible;
    private int generation;
    private int failures;
    private String subscriptionVersion;
    private Integer limitAccountPresentationRevision;
    private boolean limitAccountPresentationUnsupported;
    private String initialError = "";
    private String pendingNotificationAction;
    private JSONObject latestStats;
    private long latestStatsFetchedAt;
    private boolean historyBusy;
    private String pendingHistoryKey;
    private final ExecutorService certImportNetwork = Executors.newSingleThreadExecutor();
    private final java.util.LinkedHashMap<String, CertificateTrustPolicy.ParsedBundle> caDrafts = new java.util.LinkedHashMap<>();
    private String pendingCaPickRequestId;
    private JSONObject pendingCaDraftPayload;
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
        ThemePolicy.Spec initialTheme = ThemePolicy.resolve(DisplayPrefs.theme(this), isSystemDark());
        if (getWindow() != null) {
            getWindow().setBackgroundDrawable(new ColorDrawable(initialTheme.canvasColor));
        }
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setBackgroundColor(initialTheme.canvasColor);
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
        viewport = new FrameLayout(this);
        viewport.setBackgroundColor(initialTheme.canvasColor);
        viewport.setOnApplyWindowInsetsListener(this::applySafeArea);
        viewport.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(viewport);
        applyThemeChrome(initialTheme);
        viewport.requestApplyInsets();
        try {
            web.loadUrl(LocalContentClient.START_URL);
        } catch (Exception error) {
            int paddingPx = Math.round(24 * getResources().getDisplayMetrics().density);
            android.widget.TextView message = new android.widget.TextView(this);
            message.setText(R.string.resources_unavailable);
            message.setTextColor(initialTheme.fallbackTextColor);
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

    private boolean isSystemDark() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    @SuppressWarnings("deprecation")
    private void applyThemeChrome(ThemePolicy.Spec theme) {
        ThemePolicy.Spec resolved = theme != null ? theme : ThemePolicy.resolve(ThemePolicy.DEFAULT_THEME, isSystemDark());
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(resolved.canvasColor));
            if (android.os.Build.VERSION.SDK_INT < 35) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                        | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(resolved.statusBarColor);
                window.setNavigationBarColor(resolved.navBarColor);
            }
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.view.WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(resolved.isLight ? mask : 0, mask);
                }
            } else {
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                int lightMask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                if (resolved.isLight) flags |= lightMask;
                else flags &= ~lightMask;
                decor.setSystemUiVisibility(flags);
            }
        }
        if (viewport != null) viewport.setBackgroundColor(resolved.canvasColor);
        if (web != null) web.setBackgroundColor(resolved.canvasColor);
    }

    @SuppressWarnings("deprecation")
    private WindowInsets applySafeArea(View view, WindowInsets insets) {
        boolean imeVisible;
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            int safeTypes = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
            int handledTypes = safeTypes | WindowInsets.Type.ime();
            android.graphics.Insets safe = insets.getInsets(handledTypes);
            imeVisible = insets.isVisible(WindowInsets.Type.ime())
                    && insets.getInsets(WindowInsets.Type.ime()).bottom > 0;
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            updateImeVisibility(imeVisible);
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
        int stableBottom = insets.getStableInsetBottom();
        int imeThresholdPx = Math.round(100f * getResources().getDisplayMetrics().density);
        imeVisible = bottom > 0 && bottom > stableBottom + imeThresholdPx;
        if (android.os.Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
            android.view.DisplayCutout cutout = insets.getDisplayCutout();
            left = Math.max(left, cutout.getSafeInsetLeft());
            top = Math.max(top, cutout.getSafeInsetTop());
            right = Math.max(right, cutout.getSafeInsetRight());
            bottom = Math.max(bottom, cutout.getSafeInsetBottom());
        }
        view.setPadding(left, top, right, bottom);
        updateImeVisibility(imeVisible);
        WindowInsets remaining = insets.replaceSystemWindowInsets(0, 0, 0, 0).consumeStableInsets();
        if (android.os.Build.VERSION.SDK_INT >= 28) remaining = remaining.consumeDisplayCutout();
        return remaining;
    }

    private void updateImeVisibility(boolean visible) {
        if (lastImeVisible == visible) return;
        lastImeVisible = visible;
        if (ready && !isDestroyed()) {
            try { emit(event("imeVisibility").put("visible", visible)); } catch (Exception ignored) { }
        }
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
        pendingCaDraftPayload = null;
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
        latestStatsFetchedAt = 0L;
        historyError = "";
        historyBusy = false;
        pendingHistoryKey = null;
        clearFixedRangeCaches();
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

    private JSONObject displayPrefsPayload() throws Exception {
        return DisplayPrefs.load(this).put("systemDark", isSystemDark());
    }

    private void displayPrefsChanged() {
        try {
            emit(displayPrefsPayload().put("type", "displayPrefs"));
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
        cancelFixedRange();
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
                    long fetchedAt = System.currentTimeMillis();
                    latestStats = stats;
                    latestStatsFetchedAt = fetchedAt;
                    historyError = historyMessage;
                    if (UsageWidgetProvider.hasAnyWidgets(MainActivity.this)) {
                        UsageWidgetStore.publish(MainActivity.this, widgetBinding, stats, fetchedAt, startedAt);
                    }
                    try {
                        emit(event("stats").put("data", stats).put("fetchedAt", fetchedAt).put("historyError", historyError));
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
        @JavascriptInterface public String initialDisplayPrefs() {
            try {
                return displayPrefsPayload().toString();
            } catch (Exception ignored) {
                return "{\"separateQoderClients\":false,\"exactTrendTokens\":false,\"theme\":\"obsidian\",\"periodTabOrder\":[],\"systemDark\":false}";
            }
        }
        @JavascriptInterface public void ready() {
            main.post(() -> {
                ready = true; foregroundChanged(); limitsPrefsChanged(); displayPrefsChanged(); connectionChanged();
                if (lastImeVisible) {
                    try { emit(event("imeVisibility").put("visible", true)); } catch (Exception ignored) { }
                }
                if (pendingCaDraftPayload != null) {
                    JSONObject queued = pendingCaDraftPayload;
                    pendingCaDraftPayload = null;
                    emit(queued);
                }
                openNotificationSession(); MainActivity.this.refresh(true);
                if (foreground) updates.resume(); else updates.send();
                downloads.send();
            });
        }
        @JavascriptInterface public void saveDisplayPrefs(String serialized) {
            if (serialized == null || serialized.length() > 8192) return;
            main.post(() -> {
                if (isDestroyed()) return;
                boolean previousSeparateQoder = DisplayPrefs.separateQoderClients(MainActivity.this);
                if (DisplayPrefs.save(MainActivity.this, serialized)) {
                    JSONObject saved = DisplayPrefs.load(MainActivity.this);
                    applyThemeChrome(ThemePolicy.resolve(saved.optString("theme", ThemePolicy.DEFAULT_THEME), isSystemDark()));
                    boolean nextSeparateQoder = saved.optBoolean("separateQoderClients", false);
                    if (nextSeparateQoder != previousSeparateQoder
                            && latestStats != null
                            && latestStatsFetchedAt > 0
                            && spec != null
                            && UsageWidgetProvider.hasAnyWidgets(MainActivity.this)) {
                        UsageWidgetStore.publish(
                                MainActivity.this,
                                store.binding(),
                                latestStats,
                                latestStatsFetchedAt,
                                latestStatsFetchedAt);
                    }
                } else {
                    displayPrefsChanged();
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
        @JavascriptInterface public void queryFixedRange(String period, String requestId) {
            main.post(() -> MainActivity.this.readFixedRange(period, requestId));
        }
        @JavascriptInterface public void cancelFixedRange() {
            main.post(() -> MainActivity.this.cancelFixedRange());
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
                pendingCaDraftPayload = null;
                cancel();
                spec = null;
                subscriptionVersion = null;
                connectionChanged();
            });
        }
    }

    private void emitOrQueueCaDraft(JSONObject payload) {
        if (isDestroyed() || payload == null) return;
        if (ready) emit(payload);
        else pendingCaDraftPayload = payload;
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
            emitOrQueueCaDraft(event("caCertDraft")
                    .put("requestId", requestId)
                    .put("ok", true)
                    .put("draftToken", draftToken)
                    .put("cert", cert));
        } catch (Exception ignored) { }
    }

    private void emitCaDraftError(String requestId, String message) {
        try {
            emitOrQueueCaDraft(event("caCertDraft")
                    .put("requestId", requestId)
                    .put("ok", false)
                    .put("error", message == null ? "证书解析失败" : message));
        } catch (Exception ignored) { }
    }

    private void emitCaDraftCancelled(String requestId) {
        try {
            emitOrQueueCaDraft(event("caCertDraft")
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
            if (!found && admittedFixedRangeSessionPairs.contains(deviceId + "\u0000" + key)) {
                found = true;
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

    private void clearFixedRangeCaches() {
        synchronized (fixedRangeCacheLock) {
            fixedRangeSliceCache.clear();
            cachedDevicesHistoryKey = "";
            cachedDevicesHistory = null;
        }
        admittedFixedRangeSessionPairs.clear();
    }

    private void cancelFixedRange() {
        fixedRangeGeneration++;
        fixedRangeNetwork.getQueue().clear();
        if (fixedRangeClient != null) fixedRangeClient.cancel();
        fixedRangeClient = null;
    }

    private static boolean isDerivedFixedPeriod(String period) {
        return "yesterday".equals(period) || "week".equals(period) || "last7".equals(period) || "last30".equals(period);
    }

    private static boolean isFixedRangePeriod(String period) {
        return isDerivedFixedPeriod(period) || "today".equals(period) || "month".equals(period);
    }

    private static java.time.LocalDate parseIsoLocalDate(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
        try {
            java.time.LocalDate parsed = java.time.LocalDate.parse(value);
            return parsed.toString().equals(value) ? parsed : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String[] expectedDeviceFixedWindow(JSONObject device, String period, long nowMs) {
        if (device == null) return null;
        JSONObject periodWindows = device.optJSONObject("periodWindows");
        JSONObject todayWin = periodWindows == null ? null : periodWindows.optJSONObject("today");
        if (todayWin == null) return null;
        java.time.LocalDate snapshotDay = parseIsoLocalDate(todayWin.optString("key", ""));
        if ("today".equals(period) || "month".equals(period)) {
            if (snapshotDay == null) return null;
            JSONObject targetWin = periodWindows.optJSONObject(period);
            String targetEndsAt = targetWin == null ? "" : targetWin.optString("endsAt", "");
            if (!targetEndsAt.isEmpty()) {
                try {
                    if (nowMs >= java.time.Instant.parse(targetEndsAt).toEpochMilli()) return null;
                } catch (Exception ignored) { }
            }
            java.time.LocalDate start = "month".equals(period) ? snapshotDay.withDayOfMonth(1) : snapshotDay;
            return new String[] { start.toString(), snapshotDay.toString() };
        }
        String endsAtRaw = todayWin.optString("endsAt", "");
        if (snapshotDay == null || endsAtRaw.isEmpty()) return null;
        long endsAtMs;
        try {
            endsAtMs = java.time.Instant.parse(endsAtRaw).toEpochMilli();
        } catch (Exception ignored) {
            return null;
        }
        java.time.LocalDate currentDay;
        if (nowMs < endsAtMs) {
            currentDay = snapshotDay;
        } else {
            String tz = periodWindows.optString("timeZone", "").trim();
            if (tz.isEmpty()) return null;
            try {
                currentDay = java.time.Instant.ofEpochMilli(nowMs).atZone(java.time.ZoneId.of(tz)).toLocalDate();
            } catch (Exception ignored) {
                return null;
            }
        }
        java.time.LocalDate start;
        java.time.LocalDate end;
        switch (period) {
            case "yesterday":
                start = currentDay.minusDays(1);
                end = start;
                break;
            case "week":
                // Synced weeks start on Monday in each device's calendar.
                int offset = currentDay.getDayOfWeek().getValue() - 1;
                start = currentDay.minusDays(offset);
                end = currentDay;
                break;
            case "last7":
                start = currentDay.minusDays(6);
                end = currentDay;
                break;
            case "last30":
                start = currentDay.minusDays(29);
                end = currentDay;
                break;
            default:
                return null;
        }
        return new String[] { start.toString(), end.toString() };
    }

    private static double roundSixDecimals(double value) {
        return Math.round(value * 1_000_000d) / 1_000_000d;
    }

    private static void addJsonLongMap(JSONObject target, JSONObject source) throws Exception {
        if (source == null) return;
        java.util.Iterator<String> keys = source.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (key == null || source.isNull(key)) continue;
            long val = source.optLong(key, Long.MIN_VALUE);
            if (val == Long.MIN_VALUE) continue;
            target.put(key, Math.max(0L, target.optLong(key, 0L) + val));
        }
    }

    private static void addJsonDoubleMap(JSONObject target, JSONObject source) throws Exception {
        if (source == null) return;
        java.util.Iterator<String> keys = source.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (key == null || source.isNull(key)) continue;
            double val = source.optDouble(key, Double.NaN);
            if (Double.isNaN(val) || Double.isInfinite(val)) continue;
            target.put(key, roundSixDecimals(target.optDouble(key, 0d) + val));
        }
    }

    private static long parseIsoMillisOrZero(String value) {
        if (value == null || value.isEmpty()) return 0L;
        try { return java.time.Instant.parse(value).toEpochMilli(); } catch (Exception ignored) { return 0L; }
    }

    private static JSONObject mergeDailySessionRow(JSONObject existing, JSONObject incoming) throws Exception {
        if (existing == null) return new JSONObject(incoming.toString());
        JSONObject merged = new JSONObject(existing.toString());
        long existingTime = parseIsoMillisOrZero(existing.optString("lastUsedAt", ""));
        long incomingTime = parseIsoMillisOrZero(incoming.optString("lastUsedAt", ""));
        String[] latestFields = new String[] {
                "title", "projectId", "projectLabel", "lastUsedAt", "latestModel", "reasoningEffort",
                "contextTokens", "contextWindow", "promptCacheExpiresAt", "liveActivity",
                "nativeSessionId", "t3ThreadId", "subagentLabel"
        };
        if (incomingTime >= existingTime) {
            for (String field : latestFields) {
                if (incoming.has(field) && !incoming.isNull(field) && !"".equals(incoming.optString(field, "non-empty"))) {
                    merged.put(field, incoming.get(field));
                }
            }
            if (incoming.has("turnEnded") && !incoming.isNull("turnEnded")) {
                merged.put("turnEnded", incoming.optBoolean("turnEnded"));
            } else if (incomingTime > existingTime) {
                merged.remove("turnEnded");
            }
            String inParent = incoming.optString("parentSessionId", "");
            if (!inParent.isEmpty()) {
                merged.put("parentSessionId", inParent);
                String inParentClient = incoming.optString("parentClient", "");
                if (!inParentClient.isEmpty()) merged.put("parentClient", inParentClient);
                else merged.remove("parentClient");
                if (incoming.optBoolean("t3ParentLink", false)) merged.put("t3ParentLink", true);
                else merged.remove("t3ParentLink");
            } else if (incomingTime > existingTime && merged.optBoolean("t3ParentLink", false)) {
                merged.remove("parentSessionId");
                merged.remove("parentClient");
                merged.remove("t3ParentLink");
            }
        }
        String inStart = incoming.optString("startedAt", "");
        String exStart = existing.optString("startedAt", "");
        if (!inStart.isEmpty() && (exStart.isEmpty() || parseIsoMillisOrZero(inStart) < parseIsoMillisOrZero(exStart))) {
            merged.put("startedAt", inStart);
        }
        String[] sumLongFields = new String[] {
                "totalTokens", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
                "reasoningTokens", "unclassifiedTokens", "messageCount", "timedOutputTokens", "timedDurationMs"
        };
        for (String field : sumLongFields) {
            boolean hasA = existing.has(field) && !existing.isNull(field);
            boolean hasB = incoming.has(field) && !incoming.isNull(field);
            if (hasA && hasB) merged.put(field, existing.optLong(field, 0L) + incoming.optLong(field, 0L));
            else if (hasB) merged.put(field, incoming.optLong(field, 0L));
        }
        long unpriced = Math.max(0L, existing.optLong("unpricedTokens", 0L)) + Math.max(0L, incoming.optLong("unpricedTokens", 0L));
        if (unpriced > 0L) merged.put("unpricedTokens", unpriced);
        boolean hasCostA = existing.has("costUsd") && !existing.isNull("costUsd");
        boolean hasCostB = incoming.has("costUsd") && !incoming.isNull("costUsd");
        if (hasCostA && hasCostB) merged.put("costUsd", roundSixDecimals(existing.optDouble("costUsd", 0d) + incoming.optDouble("costUsd", 0d)));
        else if (hasCostB) merged.put("costUsd", incoming.optDouble("costUsd", 0d));
        boolean archivedBoth = (existing.optBoolean("archived", false) || existing.optBoolean("isArchived", false))
                && (incoming.optBoolean("archived", false) || incoming.optBoolean("isArchived", false));
        if (archivedBoth) merged.put("archived", true);
        else {
            merged.remove("archived");
            merged.remove("isArchived");
        }
        if (existing.optBoolean("cacheReported", false) || incoming.optBoolean("cacheReported", false)) {
            merged.put("cacheReported", true);
        }
        JSONObject models = existing.optJSONObject("models") != null ? new JSONObject(existing.optJSONObject("models").toString()) : new JSONObject();
        addJsonLongMap(models, incoming.optJSONObject("models"));
        merged.put("models", models);
        JSONObject modelCosts = existing.optJSONObject("modelCosts") != null ? new JSONObject(existing.optJSONObject("modelCosts").toString()) : new JSONObject();
        addJsonDoubleMap(modelCosts, incoming.optJSONObject("modelCosts"));
        if (modelCosts.length() > 0) merged.put("modelCosts", modelCosts);
        JSONObject providers = existing.optJSONObject("providers") != null ? new JSONObject(existing.optJSONObject("providers").toString()) : new JSONObject();
        addJsonLongMap(providers, incoming.optJSONObject("providers"));
        if (providers.length() > 0) merged.put("providers", providers);
        return merged;
    }

    private static JSONObject mergeDailyRangePeriods(java.util.List<JSONObject> dailyPeriods) throws Exception {
        long totalTokens = 0L, inputTokens = 0L, outputTokens = 0L, cacheReadTokens = 0L,
                cacheWriteTokens = 0L, reasoningTokens = 0L, unclassifiedTokens = 0L, unpricedTokens = 0L;
        double costUsd = 0d;
        boolean anyCost = false;
        boolean tokenComponents = true;
        JSONObject clients = new JSONObject();
        JSONObject clientCosts = new JSONObject();
        JSONObject models = new JSONObject();
        JSONObject modelCosts = new JSONObject();
        JSONObject projects = new JSONObject();
        JSONObject sessions = new JSONObject();
        for (JSONObject day : dailyPeriods) {
            if (day == null) continue;
            long dayTotal = Math.max(0L, day.optLong("totalTokens", 0L));
            totalTokens += dayTotal;
            inputTokens += Math.max(0L, day.optLong("inputTokens", 0L));
            outputTokens += Math.max(0L, day.optLong("outputTokens", 0L));
            cacheReadTokens += Math.max(0L, day.optLong("cacheReadTokens", 0L));
            cacheWriteTokens += Math.max(0L, day.optLong("cacheWriteTokens", 0L));
            reasoningTokens += Math.max(0L, day.optLong("reasoningTokens", 0L));
            unclassifiedTokens += Math.max(0L, day.optLong("unclassifiedTokens", 0L));
            unpricedTokens += Math.max(0L, day.optLong("unpricedTokens", 0L));
            if (day.has("costUsd") && !day.isNull("costUsd")) {
                double c = day.optDouble("costUsd", Double.NaN);
                if (!Double.isNaN(c) && !Double.isInfinite(c)) {
                    anyCost = true;
                    costUsd = roundSixDecimals(costUsd + c);
                }
            }
            JSONObject caps = day.optJSONObject("capabilities");
            if (dayTotal > 0L && (caps == null || !caps.optBoolean("tokenComponents", false))) {
                tokenComponents = false;
            }
            addJsonLongMap(clients, day.optJSONObject("clients"));
            addJsonDoubleMap(clientCosts, day.optJSONObject("clientCosts"));
            addJsonLongMap(models, day.optJSONObject("models"));
            addJsonDoubleMap(modelCosts, day.optJSONObject("modelCosts"));
            JSONObject dayProjects = day.optJSONObject("projects");
            if (dayProjects != null) {
                java.util.Iterator<String> pKeys = dayProjects.keys();
                while (pKeys.hasNext()) {
                    String pKey = pKeys.next();
                    JSONObject proj = dayProjects.optJSONObject(pKey);
                    if (pKey == null || proj == null) continue;
                    JSONObject prev = projects.optJSONObject(pKey);
                    JSONObject nextProj = new JSONObject();
                    nextProj.put("label", prev != null && !prev.optString("label", "").isEmpty()
                            ? prev.optString("label") : proj.optString("label", pKey));
                    nextProj.put("tokens", (prev == null ? 0L : Math.max(0L, prev.optLong("tokens", 0L)))
                            + Math.max(0L, proj.optLong("tokens", 0L)));
                    boolean hasPrevCost = prev == null || (prev.has("costUsd") && !prev.isNull("costUsd"));
                    boolean hasProjCost = proj.has("costUsd") && !proj.isNull("costUsd");
                    if (hasPrevCost && hasProjCost) {
                        nextProj.put("costUsd", roundSixDecimals((prev == null ? 0d : prev.optDouble("costUsd", 0d)) + proj.optDouble("costUsd", 0d)));
                    } else {
                        nextProj.put("costUsd", JSONObject.NULL);
                    }
                    projects.put(pKey, nextProj);
                }
            }
            JSONObject daySessions = day.optJSONObject("sessions");
            if (daySessions != null) {
                java.util.Iterator<String> sKeys = daySessions.keys();
                while (sKeys.hasNext()) {
                    String sKey = sKeys.next();
                    JSONObject sess = daySessions.optJSONObject(sKey);
                    if (sKey == null || sess == null) continue;
                    sessions.put(sKey, mergeDailySessionRow(sessions.optJSONObject(sKey), sess));
                }
            }
        }
        JSONObject out = new JSONObject()
                .put("totalTokens", totalTokens)
                .put("inputTokens", inputTokens)
                .put("outputTokens", outputTokens)
                .put("cacheReadTokens", cacheReadTokens)
                .put("cacheWriteTokens", cacheWriteTokens)
                .put("reasoningTokens", reasoningTokens)
                .put("unclassifiedTokens", unclassifiedTokens)
                .put("costUsd", anyCost || totalTokens == 0L ? costUsd : JSONObject.NULL)
                .put("capabilities", new JSONObject().put("tokenComponents", tokenComponents))
                .put("clients", clients)
                .put("clientCosts", clientCosts)
                .put("models", models)
                .put("modelCosts", modelCosts)
                .put("projects", projects)
                .put("sessions", sessions);
        if (unpricedTokens > 0L) out.put("unpricedTokens", unpricedTokens);
        return out;
    }

    private static JSONObject fetchAndDecodeFixedRange(
            HubClient request,
            ConnectionSpec destination,
            String devId,
            String rev,
            String cleanPeriod,
            String[] expectedWindow) throws Exception {
        JSONObject index = request.fixedRangesIndex(destination, devId);
        if (!rev.equals(index.optString("revision", ""))) return null;
        JSONObject ranges = index.optJSONObject("ranges");
        if (ranges == null) return null;
        if (ranges.has(cleanPeriod)) {
            if (!isDerivedFixedPeriod(cleanPeriod)) return null;
            JSONObject rangeMeta = ranges.optJSONObject(cleanPeriod);
            if (rangeMeta == null
                    || !expectedWindow[0].equals(rangeMeta.optString("start", ""))
                    || !expectedWindow[1].equals(rangeMeta.optString("end", ""))) {
                return null;
            }
            int firstPage = rangeMeta.optInt("firstPage", -1);
            int pageCount = rangeMeta.optInt("pageCount", -1);
            if (firstPage < 0 || pageCount < 0
                    || pageCount > ConnectionSpec.MAX_FIXED_RANGE_PAGES
                    || firstPage + pageCount > ConnectionSpec.MAX_FIXED_RANGE_PAGES) {
                return null;
            }
            java.util.List<JSONArray> pages = new java.util.ArrayList<>(pageCount);
            for (int p = 0; p < pageCount; p++) {
                JSONObject pageBody = request.fixedRangesPage(destination, devId, rev, firstPage + p);
                JSONArray rows = pageBody.optJSONArray("rows");
                if (rows == null) return null;
                pages.add(rows);
            }
            return decodeFixedRangeSlice(cleanPeriod, rangeMeta, pages, rev);
        }
        // Daily range format (#1682): date keys YYYY-MM-DD up to MAX_DAILY_RANGE_PAGES (64).
        java.time.LocalDate startDate = parseIsoLocalDate(expectedWindow[0]);
        java.time.LocalDate endDate = parseIsoLocalDate(expectedWindow[1]);
        if (startDate == null || endDate == null || startDate.isAfter(endDate)) return null;
        long spanDays = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1L;
        if (spanDays < 1L || spanDays > 31L) return null;
        java.util.List<String> dayKeys = new java.util.ArrayList<>((int) spanDays);
        java.util.LinkedHashSet<Integer> neededPages = new java.util.LinkedHashSet<>();
        for (java.time.LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
            String dKey = d.toString();
            JSONObject dayMeta = ranges.optJSONObject(dKey);
            if (dayMeta == null
                    || !dKey.equals(dayMeta.optString("start", ""))
                    || !dKey.equals(dayMeta.optString("end", ""))) {
                return null;
            }
            int fp = dayMeta.optInt("firstPage", -1);
            int pc = dayMeta.optInt("pageCount", -1);
            if (fp < 0 || pc < 0 || pc > ConnectionSpec.MAX_DAILY_RANGE_PAGES
                    || fp + pc > ConnectionSpec.MAX_DAILY_RANGE_PAGES) {
                return null;
            }
            dayKeys.add(dKey);
            for (int p = 0; p < pc; p++) neededPages.add(fp + p);
        }
        java.util.Map<Integer, JSONArray> pageMap = new java.util.HashMap<>(neededPages.size());
        for (Integer pageNum : neededPages) {
            JSONObject pageBody = request.fixedRangesPage(destination, devId, rev, pageNum);
            JSONArray rows = pageBody.optJSONArray("rows");
            if (rows == null) return null;
            pageMap.put(pageNum, rows);
        }
        java.util.List<JSONObject> dailyPeriods = new java.util.ArrayList<>(dayKeys.size());
        for (String dKey : dayKeys) {
            JSONObject dayMeta = ranges.optJSONObject(dKey);
            int fp = dayMeta.optInt("firstPage", 0);
            int pc = dayMeta.optInt("pageCount", 0);
            java.util.List<JSONArray> dayPages = new java.util.ArrayList<>(pc);
            for (int p = 0; p < pc; p++) dayPages.add(pageMap.get(fp + p));
            JSONObject decodedDay = decodeFixedRangeSlice(dKey, dayMeta, dayPages, rev);
            if (decodedDay == null) return null;
            dailyPeriods.add(decodedDay.optJSONObject("period"));
        }
        return new JSONObject()
                .put("revision", rev)
                .put("start", expectedWindow[0])
                .put("end", expectedWindow[1])
                .put("period", mergeDailyRangePeriods(dailyPeriods));
    }

    private static JSONObject decodeFixedRangeSlice(String period, JSONObject rangeMeta, java.util.List<JSONArray> pages, String revision) throws Exception {
        if (rangeMeta == null) return null;
        java.time.LocalDate start = parseIsoLocalDate(rangeMeta.optString("start", ""));
        java.time.LocalDate end = parseIsoLocalDate(rangeMeta.optString("end", ""));
        JSONObject totals = rangeMeta.optJSONObject("totals");
        int expectedSessions = rangeMeta.optInt("sessions", -1);
        int expectedProjects = rangeMeta.optInt("projects", -1);
        int pageCount = rangeMeta.optInt("pageCount", -1);
        if (start == null || end == null || start.isAfter(end) || totals == null
                || !totals.has("totalTokens") || totals.optLong("totalTokens", -1L) < 0L
                || expectedSessions < 0 || expectedProjects < 0 || pageCount < 0
                || (pageCount == 0) != (expectedSessions + expectedProjects == 0)
                || pages.size() != pageCount) {
            return null;
        }
        JSONObject sessions = new JSONObject();
        JSONObject projects = new JSONObject();
        for (JSONArray pageRows : pages) {
            if (pageRows == null || pageRows.length() == 0) return null;
            for (int i = 0; i < pageRows.length(); i++) {
                JSONArray tuple = pageRows.optJSONArray(i);
                if (tuple == null || tuple.length() != 4) return null;
                String rowRange = tuple.optString(0, "");
                String kind = tuple.optString(1, "");
                String key = tuple.optString(2, "");
                JSONObject rowObj = tuple.optJSONObject(3);
                if (!period.equals(rowRange) || key.isEmpty() || rowObj == null) return null;
                if ("sessions".equals(kind)) {
                    if (sessions.has(key)) return null;
                    sessions.put(key, rowObj);
                } else if ("projects".equals(kind)) {
                    if (projects.has(key)) return null;
                    projects.put(key, rowObj);
                } else {
                    return null;
                }
            }
        }
        if (sessions.length() != expectedSessions || projects.length() != expectedProjects) return null;
        JSONObject reconstructed = new JSONObject(totals.toString());
        reconstructed.put("sessions", sessions);
        reconstructed.put("projects", projects);
        return new JSONObject()
                .put("revision", revision)
                .put("start", start.toString())
                .put("end", end.toString())
                .put("period", reconstructed);
    }

    private void rememberFixedRangeSessions(String deviceId, JSONObject slice) {
        if (deviceId == null || deviceId.isEmpty() || slice == null) return;
        JSONObject periodObj = slice.optJSONObject("period");
        JSONObject sessions = periodObj == null ? null : periodObj.optJSONObject("sessions");
        if (sessions == null) return;
        java.util.Iterator<String> keys = sessions.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (key == null || key.isEmpty()) continue;
            synchronized (admittedFixedRangeSessionPairs) {
                while (admittedFixedRangeSessionPairs.size() >= 2048) {
                    java.util.Iterator<String> it = admittedFixedRangeSessionPairs.iterator();
                    if (!it.hasNext()) break;
                    it.next();
                    it.remove();
                }
                admittedFixedRangeSessionPairs.add(deviceId + "\u0000" + key);
            }
        }
    }

    private static JSONObject stripPeriodDetails(JSONObject rawPeriod) throws Exception {
        if (rawPeriod == null) return null;
        JSONObject copy = new JSONObject(rawPeriod.toString());
        copy.remove("sessions");
        copy.remove("projects");
        return copy;
    }

    private static JSONArray sanitizeDeviceHistories(JSONArray rawDevices) throws Exception {
        JSONArray clean = new JSONArray();
        if (rawDevices == null) return clean;
        for (int i = 0; i < rawDevices.length(); i++) {
            JSONObject record = rawDevices.optJSONObject(i);
            if (record == null) continue;
            String deviceId = record.optString("deviceId", record.optString("id", "")).trim();
            if (deviceId.isEmpty()) continue;
            boolean historyAvailable = record.optBoolean("historyAvailable", false)
                    && record.has("history") && !record.isNull("history")
                    && record.optJSONObject("history") != null;
            JSONObject rawPeriods = record.optJSONObject("periods");
            JSONObject periods = new JSONObject();
            for (String pName : new String[] { "today", "month", "allTime" }) {
                JSONObject pObj = rawPeriods != null ? rawPeriods.optJSONObject(pName) : record.optJSONObject(pName);
                if (pObj != null) periods.put(pName, stripPeriodDetails(pObj));
            }
            JSONObject item = new JSONObject()
                    .put("deviceId", deviceId)
                    .put("hostname", record.optString("hostname", "").trim())
                    .put("platform", record.optString("platform", "").trim())
                    .put("updatedAt", record.optString("updatedAt", record.optString("receivedAt", "")))
                    .put("agentVersion", record.optString("agentVersion", "").trim())
                    .put("periodWindows", record.optJSONObject("periodWindows") != null
                            ? new JSONObject(record.optJSONObject("periodWindows").toString())
                            : JSONObject.NULL)
                    .put("periods", periods)
                    .put("historyAvailable", historyAvailable)
                    .put("history", historyAvailable
                            ? new JSONObject(record.optJSONObject("history").toString())
                            : JSONObject.NULL);
            clean.put(item);
        }
        return clean;
    }

    private static String devicesObservationSignature(JSONArray devices) {
        if (devices == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d == null) continue;
            sb.append(d.optString("deviceId", "")).append('@').append(d.optString("updatedAt", "")).append(';');
        }
        return sb.toString();
    }

    private void readFixedRange(String period, String requestId) {
        cancelFixedRange();
        String cleanPeriod = period == null ? "" : period.trim();
        if (!foreground || spec == null || !isFixedRangePeriod(cleanPeriod)
                || requestId == null || !requestId.matches("[a-zA-Z0-9-]{1,80}")) {
            return;
        }
        if (latestStats == null) {
            try {
                emit(event("fixedRangeResult")
                        .put("period", cleanPeriod)
                        .put("requestId", requestId)
                        .put("error", "stats_unavailable"));
            } catch (Exception ignored) { }
            return;
        }
        int epoch = generation;
        int queryEpoch = fixedRangeGeneration;
        ConnectionSpec destination = spec;
        JSONObject statsSnapshot = latestStats;
        HubClient request = new HubClient();
        fixedRangeClient = request;
        fixedRangeNetwork.execute(() -> {
            JSONObject payload = event("fixedRangeResult");
            try {
                payload.put("period", cleanPeriod);
                payload.put("requestId", requestId);
                long nowMs = System.currentTimeMillis();
                JSONArray devices = statsSnapshot.optJSONArray("devices");
                JSONObject revisions = statsSnapshot.optJSONObject("fixedRangeRevisions");
                JSONObject scanned = new JSONObject();
                boolean needsHistoryFallback = false;
                boolean derivedPeriod = isDerivedFixedPeriod(cleanPeriod);
                for (int i = 0; devices != null && i < devices.length(); i++) {
                    JSONObject device = devices.optJSONObject(i);
                    if (device == null) continue;
                    String devId = device.optString("deviceId", "").trim();
                    if (devId.isEmpty()) continue;
                    if (!derivedPeriod) {
                        JSONObject omitted = device.optJSONObject("sessionDetailsOmitted");
                        if (omitted == null || omitted.optInt(cleanPeriod, 0) <= 0) continue;
                    }
                    String[] expectedWindow = expectedDeviceFixedWindow(device, cleanPeriod, nowMs);
                    String rev = revisions == null ? "" : revisions.optString(devId, "").trim();
                    if (expectedWindow != null && !rev.isEmpty()) {
                        String cacheKey = epoch + "\u0000" + devId + "\u0000" + rev + "\u0000"
                                + cleanPeriod + "\u0000" + expectedWindow[0] + "\u0000" + expectedWindow[1];
                        JSONObject cached;
                        synchronized (fixedRangeCacheLock) {
                            cached = fixedRangeSliceCache.get(cacheKey);
                        }
                        if (cached != null) {
                            JSONObject copy = new JSONObject(cached.toString());
                            scanned.put(devId, copy);
                            rememberFixedRangeSessions(devId, copy);
                        } else {
                            try {
                                JSONObject decoded = fetchAndDecodeFixedRange(
                                        request, destination, devId, rev, cleanPeriod, expectedWindow);
                                if (decoded != null) {
                                    synchronized (fixedRangeCacheLock) {
                                        fixedRangeSliceCache.put(cacheKey, new JSONObject(decoded.toString()));
                                    }
                                    scanned.put(devId, decoded);
                                    rememberFixedRangeSessions(devId, decoded);
                                }
                            } catch (HubClient.HubError hubErr) {
                                if (hubErr.status == 401 || hubErr.status == 403) throw hubErr;
                                // 404/409 or transient page mismatch falls through to History fallback.
                            }
                        }
                    }
                    if (derivedPeriod && !scanned.has(devId)) {
                        needsHistoryFallback = true;
                    }
                }
                payload.put("scanned", scanned);
                if (needsHistoryFallback) {
                    String historyKey = epoch + "\u0000"
                            + statsSnapshot.optString("deviceHistoryRevision", "") + "\u0000"
                            + devicesObservationSignature(devices);
                    JSONArray histories = null;
                    synchronized (fixedRangeCacheLock) {
                        if (historyKey.equals(cachedDevicesHistoryKey) && cachedDevicesHistory != null) {
                            histories = new JSONArray(cachedDevicesHistory.toString());
                        }
                    }
                    if (histories == null) {
                        try {
                            JSONObject devicesBody = request.devices(destination);
                            JSONArray sanitized = sanitizeDeviceHistories(devicesBody.optJSONArray("devices"));
                            synchronized (fixedRangeCacheLock) {
                                cachedDevicesHistoryKey = historyKey;
                                cachedDevicesHistory = new JSONArray(sanitized.toString());
                            }
                            histories = sanitized;
                        } catch (HubClient.HubError hubErr) {
                            if (hubErr.status == 401 || hubErr.status == 403) throw hubErr;
                            payload.put("historyError", mapReportHubError(hubErr));
                        } catch (Exception devErr) {
                            payload.put("historyError", "read_failed");
                        }
                    }
                    if (histories != null) {
                        payload.put("deviceHistories", histories);
                    }
                }
            } catch (Exception error) {
                try {
                    payload.put("period", cleanPeriod);
                    payload.put("requestId", requestId);
                    payload.put("error", mapReportHubError(error));
                } catch (Exception ignored) { }
            }
            main.post(() -> {
                if (epoch != generation || queryEpoch != fixedRangeGeneration || !foreground) return;
                fixedRangeClient = null;
                emit(payload);
            });
        });
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
        pendingCaDraftPayload = null;
        clearFixedRangeCaches();
        cancel();
        network.shutdownNow();
        certImportNetwork.shutdownNow();
        conversationNetwork.shutdownNow();
        reportsListNetwork.shutdownNow();
        reportsDetailNetwork.shutdownNow();
        agManagerNetwork.shutdownNow();
        fixedRangeNetwork.shutdownNow();
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
