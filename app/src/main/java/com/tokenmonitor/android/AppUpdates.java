package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.Supplier;
import org.json.JSONObject;

/** All state transitions run on the main thread; requests are fenced across stops. */
final class AppUpdates {
    interface Call {
        JSONObject get() throws Exception;
        void cancel();
    }

    private final SharedPreferences prefs;
    private final String installed;
    private final Supplier<Call> calls;
    private final LongSupplier clock;
    private final Consumer<JSONObject> listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1));
    private GitHubRelease release;
    private Call active;
    private boolean foreground;
    private boolean checking;
    private boolean closed;
    private int generation;
    private long previousAttempt;
    private String error = "";

    AppUpdates(Context context, Consumer<JSONObject> listener) {
        this(context, installedVersion(context), GitHubUpdateClient::new, System::currentTimeMillis, listener);
    }

    AppUpdates(Context context, String installed, Supplier<Call> calls, LongSupplier clock, Consumer<JSONObject> listener) {
        this.prefs = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE);
        this.installed = installed;
        this.calls = calls;
        this.clock = clock;
        this.listener = listener;
        String cached = prefs.getString("release", "");
        if (!cached.isEmpty()) {
            try {
                if (cached.length() > 65536) throw new IllegalArgumentException("Oversized cached update");
                release = GitHubRelease.parse(new JSONObject(cached));
            } catch (Exception ignored) { prefs.edit().remove("release").remove("checkedAt").remove("lastAttempt").apply(); }
        }
    }

    private static String installedVersion(Context context) {
        try { return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName; }
        catch (Exception ignored) { return "0.0.0"; }
    }

    void resume() { foreground = true; send(); check(false); }
    void pause() { foreground = false; cancel(); }
    void close() { pause(); closed = true; worker.shutdownNow(); }

    private void cancel() {
        generation++;
        if (active != null) active.cancel();
        active = null;
        worker.getQueue().clear();
        if (checking) prefs.edit().putLong("lastAttempt", previousAttempt).apply();
        checking = false;
    }

    void automatic(boolean enabled) {
        prefs.edit().putBoolean("automatic", enabled).apply();
        if (!enabled) cancel();
        send();
        if (enabled) check(false);
    }

    void check(boolean manual) {
        if (closed || !foreground || checking) return;
        long now = clock.getAsLong();
        previousAttempt = prefs.getLong("lastAttempt", 0);
        if (!AppUpdatePolicy.due(prefs.getBoolean("automatic", true), manual, previousAttempt, now)) return;
        prefs.edit().putLong("lastAttempt", now).apply();
        checking = true;
        error = "";
        int epoch = ++generation;
        Call request = calls.get();
        active = request;
        send();
        worker.execute(() -> {
            GitHubRelease found = null;
            String failure = "";
            try { found = GitHubRelease.parse(request.get()); }
            catch (java.io.IOException problem) {
                failure = problem.getMessage() != null && problem.getMessage().startsWith("GitHub")
                        ? problem.getMessage() : "检查更新失败，请检查网络后重试";
            } catch (Exception problem) { failure = "更新信息无效或尚未提供正式 APK"; }
            GitHubRelease result = found;
            String message = failure;
            main.post(() -> {
                if (closed || !foreground || epoch != generation) return;
                active = null;
                checking = false;
                error = message;
                if (result != null) {
                    release = result;
                    try { prefs.edit().putString("release", result.cache().toString()).putLong("checkedAt", clock.getAsLong()).apply(); }
                    catch (Exception ignored) { error = "无法保存更新检查结果"; }
                }
                send();
            });
        });
    }

    String downloadUrl() {
        return release != null && AppUpdatePolicy.newer(release.version, installed) ? AppUpdatePolicy.apkUrl(release.version) : null;
    }

    void downloadFailed() { error = "无法打开下载，请确认设备已安装浏览器"; send(); }

    void send() {
        if (closed) return;
        try {
            listener.accept(new JSONObject().put("type", "appUpdate").put("currentVersion", installed)
                    .put("automatic", prefs.getBoolean("automatic", true)).put("checking", checking)
                    .put("available", downloadUrl() != null).put("checkedAt", prefs.getLong("checkedAt", 0))
                    .put("latestVersion", release == null ? "" : release.version).put("name", release == null ? "" : release.name)
                    .put("notes", release == null ? "" : release.notes).put("publishedAt", release == null ? "" : release.publishedAt)
                    .put("size", release == null ? 0 : release.size).put("error", error));
        } catch (Exception ignored) { }
    }
}
