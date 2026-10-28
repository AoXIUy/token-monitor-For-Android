package com.tokenmonitor.android;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class HubClient {
    private volatile boolean cancelled;
    private volatile HttpURLConnection active;

    static final class HubError extends IOException {
        final int status;
        HubError(int status, String message) { super(message); this.status = status; }
    }

    void cancel() {
        cancelled = true;
        HttpURLConnection connection = active;
        if (connection != null) connection.disconnect();
    }

    JSONObject get(ConnectionSpec spec, String path) throws Exception {
        if (cancelled) throw new IOException("Cancelled");
        HttpURLConnection connection = (HttpURLConnection) new URL(spec.endpoint(path)).openConnection();
        active = connection;
        try {
            if (cancelled) throw new IOException("Cancelled");
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Authorization", "Bearer " + spec.secret);
            connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) throw new HubError(status, "认证失败，请检查 Hub secret");
            if (status >= 300 && status < 400) throw new HubError(status, "Hub 返回重定向，请填写最终地址");
            if (status == 404) throw new HubError(status, "Hub 不支持此接口，请检查地址或更新 Hub");
            if (status != 200) throw new HubError(status, "Hub 暂时不可用（HTTP " + status + "）");
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).contains("application/json")) {
                throw new HubError(status, "此地址未返回 Hub JSON 数据");
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled) throw new IOException("Cancelled");
                    if (output.size() + count > 16 * 1024 * 1024) throw new HubError(status, "Hub 响应超过 16 MiB 限制");
                    output.write(buffer, 0, count);
                }
                return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
        } finally {
            connection.disconnect();
            active = null;
        }
    }
}
