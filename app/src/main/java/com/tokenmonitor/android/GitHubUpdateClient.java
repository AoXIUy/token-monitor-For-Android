package com.tokenmonitor.android;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONObject;

/** Public GitHub traffic has its own connection and never uses Hub credentials. */
final class GitHubUpdateClient implements AppUpdates.Call {
    private volatile HttpURLConnection active;
    private volatile boolean cancelled;

    @Override public void cancel() {
        cancelled = true;
        HttpURLConnection connection = active;
        if (connection != null) connection.disconnect();
    }

    @Override public JSONObject get() throws Exception {
        if (cancelled) throw new IOException("Cancelled");
        HttpURLConnection connection = (HttpURLConnection) new URL(AppUpdatePolicy.API).openConnection();
        active = connection;
        try {
            if (cancelled) throw new IOException("Cancelled");
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2026-03-10");
            connection.setRequestProperty("User-Agent", "Token-Monitor-Android-Updater");
            int status = connection.getResponseCode();
            if (status == 403 || status == 429) throw new IOException("GitHub 请求频率受限，请稍后重试");
            if (status == 404) throw new IOException("暂未找到正式发布版本");
            if (status != 200) throw new IOException("GitHub 暂时不可用（HTTP " + status + "）");
            String type = connection.getContentType();
            if (type == null || !type.toLowerCase(Locale.ROOT).contains("application/json")) throw new IOException("GitHub 未返回版本数据");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled || Thread.currentThread().isInterrupted()) throw new IOException("Cancelled");
                    if (output.size() + count > 512 * 1024) throw new IOException("更新信息超过大小限制");
                    output.write(buffer, 0, count);
                }
                return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
        } finally {
            active = null;
            connection.disconnect();
        }
    }
}
