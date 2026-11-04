package com.tokenmonitor.android;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.function.LongConsumer;
import org.json.JSONObject;

/** HTTPS-only public assets; each redirect is checked, and no Hub state is read. */
final class UpdateDownloadClient implements AppUpdateDownloads.Call {
    interface Connections { HttpURLConnection open(URL url) throws IOException; }
    private final Connections connections;
    private volatile HttpURLConnection active;
    private volatile boolean cancelled;

    UpdateDownloadClient() { this(url -> (HttpURLConnection) url.openConnection()); }
    UpdateDownloadClient(Connections connections) { this.connections = connections; }

    @Override public void cancel() {
        cancelled = true;
        HttpURLConnection request = active;
        if (request != null) request.disconnect();
    }

    private void check(long start) throws IOException {
        if (cancelled || Thread.currentThread().isInterrupted()) throw new IOException("下载已取消");
        if (System.nanoTime() - start > 600_000_000_000L) throw new IOException("下载超时，请重试");
    }

    private void read(String original, long expected, java.io.OutputStream output, LongConsumer progress) throws Exception {
        long start = System.nanoTime();
        String address = original;
        for (int redirects = 0; redirects <= 4; redirects++) {
            check(start);
            if (!ApkUpdatePolicy.allowedRedirect(address, original)) throw new SecurityException("更新附件重定向到不受信任的地址");
            HttpURLConnection request = connections.open(new URL(address));
            active = request;
            try {
                check(start);
                request.setRequestMethod("GET");
                request.setInstanceFollowRedirects(false);
                request.setUseCaches(false);
                request.setConnectTimeout(10000);
                request.setReadTimeout(15000);
                request.setRequestProperty("Accept", "application/octet-stream");
                request.setRequestProperty("User-Agent", "Token-Monitor-Android-Updater");
                int status = request.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = request.getHeaderField("Location");
                    if (redirects == 4 || location == null) throw new IOException("GitHub 下载重定向异常");
                    address = new URI(address).resolve(location).toString();
                    continue;
                }
                if (status != 200) throw new IOException("GitHub 下载失败（HTTP " + status + "）");
                if (request.getContentLengthLong() > expected) throw new IOException("附件大小超过发布记录");
                long total = 0;
                try (InputStream input = request.getInputStream()) {
                    byte[] buffer = new byte[65536];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        check(start);
                        total += count;
                        if (total > expected) throw new IOException("附件大小超过发布记录");
                        output.write(buffer, 0, count);
                        progress.accept(total);
                    }
                }
                check(start);
                if (total != expected) throw new IOException("附件未下载完整，请重试");
                return;
            } finally { request.disconnect(); active = null; }
        }
        throw new IOException("GitHub 下载重定向异常");
    }

    @Override public JSONObject metadata(GitHubRelease release) throws Exception {
        if (release.metadataSize <= 0 || release.metadataSize > ApkUpdatePolicy.MAX_METADATA_BYTES) throw new IOException("发布校验附件过大");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        read(AppUpdatePolicy.metadataUrl(release.version), release.metadataSize, output, ignored -> { });
        return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
    }

    @Override public void download(GitHubRelease release, File file, LongConsumer progress) throws Exception {
        if (release.size <= 0 || release.size > ApkUpdatePolicy.MAX_APK_BYTES) throw new IOException("安装包超过大小限制");
        try (FileOutputStream output = new FileOutputStream(file)) {
            read(AppUpdatePolicy.apkUrl(release.version), release.size, output, progress);
            output.getFD().sync();
        }
    }
}
