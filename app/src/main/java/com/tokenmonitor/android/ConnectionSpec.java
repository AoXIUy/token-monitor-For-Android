package com.tokenmonitor.android;

import java.net.URI;
import java.net.URISyntaxException;

/** Immutable destination binding. Never reuse a secret after editing its URL. */
final class ConnectionSpec {
    final String url;
    final String secret;
    final boolean allowHttp;

    ConnectionSpec(String address, String secret, boolean allowHttp) {
        try {
            URI uri = new URI(address.trim());
            String scheme = uri.getScheme();
            if (!("https".equals(scheme) || "http".equals(scheme)) || uri.getHost() == null
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || address.length() > 2048
                    || uri.getPort() > 65535 || uri.getPort() == 0) {
                throw new IllegalArgumentException("请输入完整的 Hub HTTP(S) 地址，不含账号、查询参数或片段");
            }
            if ("http".equals(scheme) && !allowHttp) {
                throw new IllegalArgumentException("局域网 HTTP 需要打开「允许 HTTP」，或使用 HTTPS");
            }
            if (secret.isEmpty() || secret.length() > 4096) {
                throw new IllegalArgumentException("请输入 Hub 的 shared secret");
            }
            for (int i = 0; i < secret.length(); i++) {
                if (Character.isISOControl(secret.charAt(i))) {
                    throw new IllegalArgumentException("Secret 不能包含换行或控制字符");
                }
            }
            this.url = uri.toASCIIString().replaceAll("/+$", "");
            this.secret = secret;
            this.allowHttp = allowHttp;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Hub 地址格式无效");
        }
    }

    String endpoint(String path) {
        if (!("/api/stats".equals(path) || "/api/subscriptions".equals(path))) {
            throw new IllegalArgumentException("Unsupported read endpoint");
        }
        return url + path;
    }

    String conversationEndpoint(String deviceId, String key, String cursor) {
        if (deviceId == null || deviceId.isEmpty() || deviceId.length() > 256 || key == null || key.length() > 512
                || !key.matches("(codex|antigravity):[^\\s\\\\/\\x00-\\x1f]+")
                || key.endsWith(":.") || key.endsWith(":..") || cursor == null
                || !(cursor.isEmpty() || cursor.matches("[a-f0-9]{24}:[0-9]{1,7}"))) {
            throw new IllegalArgumentException("Invalid conversation query");
        }
        try {
            return url + "/api/session-conversations?deviceId=" + java.net.URLEncoder.encode(deviceId, "UTF-8")
                    + "&key=" + java.net.URLEncoder.encode(key, "UTF-8")
                    + "&cursor=" + java.net.URLEncoder.encode(cursor, "UTF-8");
        } catch (java.io.UnsupportedEncodingException error) { throw new IllegalStateException(error); }
    }

    String fingerprint() {
        return digest(url + "\u0000" + secret + "\u0000" + allowHttp);
    }

    static String digest(String value) {
        try {
            byte[] bytes = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte item : bytes) hex.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
