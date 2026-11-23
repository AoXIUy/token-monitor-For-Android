package com.tokenmonitor.android;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;

final class HubClient {
    private volatile boolean cancelled;
    private volatile HttpURLConnection active;
    private String cachedCaFingerprint;
    private SSLSocketFactory cachedSocketFactory;

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
        return getUrl(spec, spec.endpoint(path), 16 * 1024 * 1024);
    }

    JSONObject limitAccountPresentation(ConnectionSpec spec) throws Exception {
        return getUrl(spec, spec.endpoint("/api/sync/settings/limitAccountPresentation"), 256 * 1024);
    }

    JSONObject conversation(ConnectionSpec spec, String deviceId, String key, String cursor) throws Exception {
        return getUrl(spec, spec.conversationEndpoint(deviceId, key, cursor), 384 * 1024);
    }

    JSONObject approvalAlerts(ConnectionSpec spec) throws Exception {
        return getUrl(spec, spec.approvalAlertsEndpoint(), 128 * 1024);
    }

    JSONObject reportsList(ConnectionSpec spec, String granularity, int limit) throws Exception {
        return getUrl(spec, spec.reportsListEndpoint(granularity, limit), 512 * 1024);
    }

    JSONObject reportDetail(ConnectionSpec spec, String granularity, String periodKey) throws Exception {
        return getUrl(spec, spec.reportDetailEndpoint(granularity, periodKey, "both"), 2 * 1024 * 1024);
    }

    JSONObject antigravityManager(ConnectionSpec spec) throws Exception {
        return getUrl(spec, spec.antigravityManagerEndpoint(), 512 * 1024);
    }

    private SSLSocketFactory socketFactoryFor(ConnectionSpec spec) throws Exception {
        String key = spec.hasCustomCa() ? spec.caFingerprintSha256 : "";
        if (cachedSocketFactory != null && key.equals(cachedCaFingerprint)) {
            return cachedSocketFactory;
        }
        SSLSocketFactory created = spec.hasCustomCa()
                ? CertificateTrustPolicy.createPinnedSocketFactory(spec.caCertPem)
                : CertificateTrustPolicy.createSystemSocketFactory();
        cachedCaFingerprint = key;
        cachedSocketFactory = created;
        return created;
    }

    private JSONObject getUrl(ConnectionSpec spec, String url, int maxBytes) throws Exception {
        if (cancelled) throw new IOException("Cancelled");
        URL parsed = new URL(url);
        if ("http".equalsIgnoreCase(parsed.getProtocol()) && !spec.allowHttp) {
            throw new SecurityException("明文 HTTP 连接已被禁止");
        }
        HttpURLConnection connection = (HttpURLConnection) parsed.openConnection();
        active = connection;
        try {
            if (cancelled) throw new IOException("Cancelled");
            if ("https".equalsIgnoreCase(parsed.getProtocol())) {
                if (!(connection instanceof HttpsURLConnection)) {
                    throw new IOException("HTTPS 连接不受支持");
                }
                HttpsURLConnection https = (HttpsURLConnection) connection;
                // Strictly per-connection SSLSocketFactory (never mutates process-global defaults).
                // Default HostnameVerifier stays active and is never weakened.
                https.setSSLSocketFactory(socketFactoryFor(spec));
            }
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
                    if (output.size() + count > maxBytes) throw new HubError(status, "Hub 响应超过大小限制");
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
