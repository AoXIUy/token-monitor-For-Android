package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.LongConsumer;
import java.util.function.Supplier;
import org.json.JSONObject;

/** Activity-owned, bounded download worker. Only verified private files reach the installer. */
final class AppUpdateDownloads {
    interface Call {
        JSONObject metadata(GitHubRelease release) throws Exception;
        void download(GitHubRelease release, File file, LongConsumer progress) throws Exception;
        void cancel();
    }
    interface Verifier { void verify(File file, GitHubRelease release, UpdateManifest manifest) throws Exception; }
    private final SharedPreferences prefs;
    private final File root, verifiedDir;
    private final String installed;
    private final Supplier<Call> calls;
    private final Verifier verifier;
    private final Consumer<JSONObject> listener;
    private final Consumer<File> install;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1));
    private Call active;
    private GitHubRelease release;
    private UpdateManifest manifest;
    private File verifiedFile;
    private String phase = "idle", message = "", error = "", version = "";
    private long downloaded, total;
    private int generation;
    private boolean closed, installAfterVerify;

    AppUpdateDownloads(Context context, String installed, Consumer<JSONObject> listener, Consumer<File> install) {
        this(context, installed, UpdateDownloadClient::new, new UpdateApkVerifier(context), listener, install);
    }

    AppUpdateDownloads(Context context, String installed, Supplier<Call> calls, Verifier verifier,
                       Consumer<JSONObject> listener, Consumer<File> install) {
        this.installed = installed; this.calls = calls; this.verifier = verifier; this.listener = listener; this.install = install;
        prefs = context.getSharedPreferences("app-update-download", Context.MODE_PRIVATE);
        root = new File(context.getFilesDir(), "updates");
        verifiedDir = new File(root, "verified");
        restore();
    }

    private boolean current(int epoch) { return !closed && generation == epoch; }
    private boolean busy() { return "downloading".equals(phase) || "verifying".equals(phase); }

    private void restore() {
        String record = prefs.getString("verified", "");
        if (record.isEmpty()) return;
        phase = "verifying"; message = "正在复核已下载的安装包…";
        int epoch = generation;
        worker.execute(() -> {
            File file = null;
            try {
                if (record.length() > 65536) throw new SecurityException("安装包记录无效");
                JSONObject data = new JSONObject(record);
                String name = data.getString("file");
                if (!name.equals(UUID.fromString(name.replace(".apk", "")).toString() + ".apk")) throw new SecurityException("安装包记录无效");
                file = new File(verifiedDir, name);
                GitHubRelease cached = GitHubRelease.parse(data.getJSONObject("release"));
                UpdateManifest proof = UpdateManifest.parse(data.getJSONObject("metadata"), cached, BuildConfig.RELEASE_CERTIFICATE_SHA256);
                if (!AppUpdatePolicy.newer(cached.version, installed)) throw new SecurityException("此版本已安装");
                verifier.verify(file, cached, proof);
                File result = file;
                main.post(() -> {
                    if (!current(epoch)) return;
                    release = cached; manifest = proof; verifiedFile = result; version = cached.version;
                    total = downloaded = cached.size;
                    ready();
                });
            } catch (Exception problem) {
                if (file != null) file.delete();
                main.post(() -> {
                    if (!current(epoch)) return;
                    prefs.edit().remove("verified").apply(); phase = "idle"; message = ""; send();
                });
            }
        });
    }

    void start(GitHubRelease target) {
        if (closed || busy()) return;
        if (target == null || !AppUpdatePolicy.newer(target.version, installed)) return;
        if (verifiedFile != null && release != null && release.version.equals(target.version)) { requestInstall(); return; }
        discard();
        int epoch = ++generation;
        Call request = calls.get(); active = request;
        version = target.version; total = target.size; downloaded = 0; error = "";
        phase = "downloading"; message = "正在获取发布校验信息…";
        installAfterVerify = true;
        send();
        worker.execute(() -> {
            File part = new File(root, UUID.randomUUID() + ".part");
            File complete = new File(verifiedDir, UUID.randomUUID() + ".apk");
            boolean saved = false;
            try {
                if ((!root.isDirectory() && !root.mkdirs()) || (!verifiedDir.isDirectory() && !verifiedDir.mkdirs())) throw new IOException("无法创建下载目录");
                // Abandoned partial files cannot be offered to another app.
                File[] old = root.listFiles((dir, name) -> name.endsWith(".part"));
                if (old != null) for (File item : old) item.delete();
                File[] orphaned = verifiedDir.listFiles((dir, name) -> name.endsWith(".apk"));
                if (orphaned != null) for (File item : orphaned) item.delete();
                UpdateManifest proof = UpdateManifest.parse(request.metadata(target), target, BuildConfig.RELEASE_CERTIFICATE_SHA256);
                final long[] lastProgress = {0};
                request.download(target, part, bytes -> {
                    long now = System.nanoTime();
                    if (bytes != target.size && now - lastProgress[0] < 100_000_000L) return;
                    lastProgress[0] = now;
                    main.post(() -> { if (current(epoch)) { downloaded = bytes; message = "正在下载安装包…"; send(); } });
                });
                main.post(() -> { if (current(epoch)) { phase = "verifying"; message = "正在校验完整性与签名…"; send(); } });
                verifier.verify(part, target, proof);
                if (Thread.currentThread().isInterrupted()) throw new IOException("下载已取消");
                if (!part.renameTo(complete)) throw new IOException("无法保存已校验的安装包");
                JSONObject cachedRelease = target.cache();
                cachedRelease.remove("body"); cachedRelease.remove("name");
                String record = new JSONObject().put("file", complete.getName()).put("release", cachedRelease).put("metadata", proof.cache()).toString();
                main.post(() -> {
                    if (!current(epoch)) { complete.delete(); return; }
                    if (!prefs.edit().putString("verified", record).commit()) {
                        complete.delete(); failed(new IOException("无法保存安装包校验记录")); return;
                    }
                    active = null; verifiedFile = complete; release = target; manifest = proof;
                    downloaded = total; ready();
                });
                saved = true;
            } catch (Exception problem) { main.post(() -> { if (current(epoch)) failed(problem); }); }
            finally { part.delete(); if (!saved) complete.delete(); }
        });
    }

    private void ready() {
        phase = "ready"; error = ""; message = "安装包已通过完整性、版本和官方签名校验"; send();
        if (installAfterVerify) { installAfterVerify = false; install.accept(verifiedFile); }
    }

    void requestInstall() {
        if (closed) return;
        if (busy()) { installAfterVerify = true; return; }
        if (verifiedFile == null || release == null || manifest == null) return;
        int epoch = ++generation;
        File file = verifiedFile; GitHubRelease target = release; UpdateManifest proof = manifest;
        phase = "verifying"; error = ""; message = "正在复核安装包…"; send();
        worker.execute(() -> {
            try {
                verifier.verify(file, target, proof);
                main.post(() -> { if (current(epoch)) { phase = "ready"; send(); install.accept(file); } });
            } catch (Exception problem) { main.post(() -> { if (current(epoch)) { discard(); failed(problem); } }); }
        });
    }

    void permissionRequired() { phase = "permission"; message = "请在系统设置中允许安装此应用的更新"; error = ""; send(); }
    void permissionDenied() { phase = "permission"; error = "安装授权尚未开启，可点击“授权并安装”重试"; send(); }
    void installerOpened() { phase = "installing"; message = "请在系统安装器中确认更新"; error = ""; send(); }
    void installerFailed() { phase = "ready"; error = "无法打开系统安装器，请检查设备安装限制后重试"; send(); }
    void resume() {
        if ("installing".equals(phase)) { phase = "ready"; message = "系统安装器已返回，可继续安装"; }
        send();
    }

    void cancel() {
        if (closed || !busy()) return;
        generation++; installAfterVerify = false;
        if (active != null) active.cancel(); active = null;
        worker.getQueue().clear(); phase = "cancelled"; error = ""; message = "下载已取消，可重新下载"; send();
    }

    private void discard() {
        if (verifiedFile != null) verifiedFile.delete();
        prefs.edit().remove("verified").apply(); verifiedFile = null; release = null; manifest = null;
    }
    private void failed(Exception problem) {
        active = null; phase = "error"; installAfterVerify = false;
        error = problem instanceof SecurityException ? problem.getMessage() : "下载或校验失败，请检查网络和存储后重试";
        message = "未获得可安装的校验包"; send();
    }
    void send() {
        if (closed) return;
        try { listener.accept(new JSONObject().put("type", "appUpdateDownload").put("phase", phase).put("version", version)
                .put("downloaded", downloaded).put("total", total).put("message", message).put("error", error)); }
        catch (Exception ignored) { }
    }
    void close() {
        if (closed) return;
        generation++; closed = true;
        if (active != null) active.cancel(); worker.shutdownNow();
    }
}
