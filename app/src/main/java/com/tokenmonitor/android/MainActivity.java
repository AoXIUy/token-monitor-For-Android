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
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable poll = () -> refresh(false);
    private WebView web;
    private ConnectionStore store;
    private ConnectionSpec spec;
    private HubClient client;
    private boolean foreground;
    private boolean ready;
    private boolean busy;
    private boolean subscriptionsRequested;
    private int generation;
    private int failures;
    private String subscriptionVersion;
    private String initialError = "";
    private String pendingNotificationAction;
    private static final int NOTIFICATION_REQUEST = 42;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) pendingNotificationAction = savedInstanceState.getString("notificationAction");
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
        // Resize the WebView itself: its padding does not protect fixed CSS controls.
        FrameLayout viewport = new FrameLayout(this);
        viewport.setBackgroundColor(Color.rgb(9, 12, 16));
        viewport.setOnApplyWindowInsetsListener(MainActivity::applySafeArea);
        viewport.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(viewport);
        viewport.requestApplyInsets();
        try {
            web.loadUrl(LocalContentClient.START_URL);
        } catch (Exception error) {
            android.widget.TextView message = new android.widget.TextView(this);
            message.setText(R.string.resources_unavailable);
            message.setTextColor(Color.WHITE);
            viewport.removeAllViews();
            viewport.addView(message, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
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

    private void connectionChanged() {
        try {
            emit(event("connection").put("url", spec == null ? "" : spec.url)
                    .put("allowHttp", spec != null && spec.allowHttp).put("error", initialError));
            initialError = "";
            notificationState();
        } catch (Exception ignored) { }
    }

    private void foregroundChanged() {
        try { emit(event("lifecycle").put("foreground", foreground)); } catch (Exception ignored) { }
    }

    private void notificationState() {
        try {
            emit(event("notifications").put("enabled", SessionMonitorService.running())
                    .put("permission", SessionNotifications.allowed(this)).put("message", SessionMonitorService.message(this))
                    .put("lastReadAt", SessionMonitorService.lastReadAt()));
        } catch (Exception ignored) { }
    }

    private void notificationAction(String action) {
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
        else {
            try { new MonitorPreferences(this).state(false, "通知权限未授权，可在系统通知设置中开启"); } catch (Exception ignored) { }
            notificationState();
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (pendingNotificationAction != null) outState.putString("notificationAction", pendingNotificationAction);
        super.onSaveInstanceState(outState);
    }

    private void openNotificationSession() {
        if (!ready || spec == null) return;
        String key = getIntent().getStringExtra(SessionNotifications.EXTRA_KEY);
        String destination = getIntent().getStringExtra(SessionNotifications.EXTRA_DESTINATION);
        if (key == null || key.length() > 1024) return;
        getIntent().removeExtra(SessionNotifications.EXTRA_KEY);
        getIntent().removeExtra(SessionNotifications.EXTRA_DESTINATION);
        if (!spec.fingerprint().equals(destination)) {
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
        openNotificationSession();
    }

    private void cancel() {
        generation++;
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
                main.post(() -> {
                    if (epoch != generation || !foreground) return;
                    busy = false;
                    failures = 0;
                    if (UsageWidgetProvider.ids(MainActivity.this).length > 0) {
                        UsageWidgetStore.publish(MainActivity.this, widgetBinding, stats, System.currentTimeMillis(), startedAt);
                    }
                    try {
                        emit(event("stats").put("data", stats).put("fetchedAt", System.currentTimeMillis()));
                        if (subscriptionData != null) {
                            subscriptionVersion = marker;
                            emit(event("subscriptions").put("data", subscriptionData));
                        } else if (!subscriptionMessage.isEmpty()) {
                            // Retry a failed version read on explicit page entry/manual refresh,
                            // rather than adding another network request on every stats poll.
                            subscriptionVersion = marker;
                            emit(event("subscriptionError").put("message", subscriptionMessage));
                        }
                    } catch (Exception ignored) { }
                    status("online", "已连接 · 每 5 秒更新");
                    main.postDelayed(poll, subscriptionsRequested ? 0 : 5000);
                });
            } catch (Exception error) {
                String message = error instanceof HubClient.HubError ? error.getMessage()
                        : error instanceof javax.net.ssl.SSLException ? "TLS 验证失败，请检查服务器证书和设备时间"
                        : "连接失败，请检查网络、Hub 地址和服务状态";
                main.post(() -> {
                    if (epoch != generation || !foreground) return;
                    busy = false;
                    failures = Math.min(failures + 1, 4);
                    if (UsageWidgetProvider.ids(MainActivity.this).length > 0) {
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
            main.post(() -> { ready = true; foregroundChanged(); connectionChanged(); openNotificationSession(); MainActivity.this.refresh(true); });
        }
        @JavascriptInterface public void connect(String address, String secret, boolean allowHttp) {
            main.post(() -> {
                try {
                    ConnectionSpec candidate = new ConnectionSpec(address, secret, allowHttp);
                    SessionMonitorService.stop(MainActivity.this, "连接已变更，请重新开启完成提醒", true);
                    store.save(candidate);
                    cancel();
                    spec = candidate;
                    failures = 0;
                    subscriptionVersion = null;
                    connectionChanged();
                    MainActivity.this.refresh(true);
                } catch (IllegalArgumentException error) {
                    try { emit(event("formError").put("message", error.getMessage())); } catch (Exception ignored) { }
                } catch (Exception error) {
                    try { emit(event("formError").put("message", "无法加密保存连接，请检查设备存储后重试")); } catch (Exception ignored) { }
                }
            });
        }
        @JavascriptInterface public void refresh() { main.post(() -> MainActivity.this.refresh(true)); }
        @JavascriptInterface public void subscriptions() { main.post(() -> MainActivity.this.refresh(true)); }
        @JavascriptInterface public void monitor(boolean enabled) {
            main.post(() -> {
                if (enabled) notificationAction("enable");
                else {
                    try { SessionMonitorService.stop(MainActivity.this, "完成提醒已关闭", false); } catch (Exception ignored) { }
                    notificationState();
                }
            });
        }
        @JavascriptInterface public void testNotification() { main.post(() -> notificationAction("test")); }
        @JavascriptInterface public void notificationSettings() {
            main.post(() -> startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName())));
        }
        @JavascriptInterface public void disconnect() {
            main.post(() -> {
                try { SessionMonitorService.stop(MainActivity.this, "Hub 已断开，完成提醒已关闭", true); store.clear(); }
                catch (Exception error) { status("offline", "无法清除已保存的连接，请检查设备存储"); return; }
                cancel();
                spec = null;
                subscriptionVersion = null;
                connectionChanged();
            });
        }
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) web.onResume();
        foregroundChanged();
        try {
            MonitorPreferences monitoring = new MonitorPreferences(this);
            if (!SessionMonitorService.running() && monitoring.enabled()) monitoring.state(false, "后台监控已中断，请重新开启完成提醒");
        } catch (Exception ignored) { }
        notificationState();
        refresh(false);
    }
    @Override protected void onStop() {
        foreground = false;
        cancel();
        foregroundChanged();
        if (web != null) web.onPause();
        super.onStop();
    }
    @Override protected void onDestroy() {
        cancel();
        network.shutdownNow();
        if (web != null) { web.removeJavascriptInterface("HubNative"); web.destroy(); }
        super.onDestroy();
    }
}
