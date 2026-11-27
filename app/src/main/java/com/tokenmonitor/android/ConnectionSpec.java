package com.tokenmonitor.android;

import java.net.URI;
import java.net.URISyntaxException;

/** Immutable destination binding. Never reuse a secret after editing its URL. */
final class ConnectionSpec {
    final String url;
    final String secret;
    final boolean allowHttp;
    final String caCertPem;
    final String caFingerprintSha256;

    ConnectionSpec(String address, String secret, boolean allowHttp) {
        this(address, secret, allowHttp, "");
    }

    ConnectionSpec(String address, String secret, boolean allowHttp, String caCertPem) {
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
            if (secret == null || secret.isEmpty() || secret.length() > 4096) {
                throw new IllegalArgumentException("请输入 Hub 的 shared secret");
            }
            for (int i = 0; i < secret.length(); i++) {
                if (Character.isISOControl(secret.charAt(i))) {
                    throw new IllegalArgumentException("Secret 不能包含换行或控制字符");
                }
            }
            String rawCa = caCertPem == null ? "" : caCertPem.trim();
            if (!rawCa.isEmpty()) {
                if ("http".equals(scheme)) {
                    throw new IllegalArgumentException("仅 HTTPS 连接支持导入自定义 CA 证书");
                }
                CertificateTrustPolicy.ParsedBundle parsed = CertificateTrustPolicy.parseStoredPem(rawCa);
                this.caCertPem = parsed.canonicalPem;
                this.caFingerprintSha256 = parsed.fingerprintSha256;
            } else {
                this.caCertPem = "";
                this.caFingerprintSha256 = "";
            }
            this.url = uri.toASCIIString().replaceAll("/+$", "");
            this.secret = secret;
            this.allowHttp = allowHttp;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Hub 地址格式无效");
        }
    }

    static final int MAX_FIXED_RANGE_PAGES = 32;
    static final int MAX_DAILY_RANGE_PAGES = 64;

    boolean hasCustomCa() {
        return !caCertPem.isEmpty();
    }

    String endpoint(String path) {
        if (!("/api/stats".equals(path)
                || "/api/devices".equals(path)
                || "/api/subscriptions".equals(path)
                || "/api/sync/settings/limitAccountPresentation".equals(path))) {
            throw new IllegalArgumentException("Unsupported read endpoint");
        }
        return url + path;
    }

    private static void validateQueryToken(String value, int maxLength, String field) {
        if (value == null || value.isEmpty() || value.length() > maxLength || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid " + field);
        }
        for (int i = 0; i < value.length(); i++) {
            if (Character.isISOControl(value.charAt(i))) {
                throw new IllegalArgumentException("Invalid " + field);
            }
        }
    }

    String fixedRangesIndexEndpoint(String deviceId) {
        validateQueryToken(deviceId, 256, "fixed range deviceId");
        try {
            return url + "/api/fixed-ranges?deviceId=" + java.net.URLEncoder.encode(deviceId, "UTF-8") + "&daily=1";
        } catch (java.io.UnsupportedEncodingException error) { throw new IllegalStateException(error); }
    }

    String fixedRangesPageEndpoint(String deviceId, String revision, int page) {
        validateQueryToken(deviceId, 256, "fixed range deviceId");
        validateQueryToken(revision, 128, "fixed range revision");
        if (page < 0 || page >= MAX_DAILY_RANGE_PAGES) {
            throw new IllegalArgumentException("Invalid fixed range page");
        }
        try {
            return url + "/api/fixed-ranges?deviceId=" + java.net.URLEncoder.encode(deviceId, "UTF-8")
                    + "&daily=1&revision=" + java.net.URLEncoder.encode(revision, "UTF-8")
                    + "&page=" + page;
        } catch (java.io.UnsupportedEncodingException error) { throw new IllegalStateException(error); }
    }

    String approvalAlertsEndpoint() {
        return url + "/api/approval-alerts";
    }

    String antigravityManagerEndpoint() {
        return url + "/api/antigravity-manager";
    }

    String reportsListEndpoint(String granularity, int limit) {
        String cleanGranularity = granularity == null ? "" : granularity.trim();
        if (!cleanGranularity.isEmpty()
                && !("daily".equals(cleanGranularity) || "weekly".equals(cleanGranularity) || "monthly".equals(cleanGranularity))) {
            throw new IllegalArgumentException("Invalid report granularity");
        }
        int boundedLimit = Math.max(1, Math.min(100, limit));
        String base = url + "/api/reports?limit=" + boundedLimit;
        return cleanGranularity.isEmpty() ? base : base + "&granularity=" + cleanGranularity;
    }

    String reportDetailEndpoint(String granularity, String periodKey, String format) {
        if (!("daily".equals(granularity) || "weekly".equals(granularity) || "monthly".equals(granularity))) {
            throw new IllegalArgumentException("Invalid report granularity");
        }
        String cleanKey = periodKey == null || periodKey.trim().isEmpty() ? "current" : periodKey.trim();
        if (!("latest".equals(cleanKey) || "current".equals(cleanKey)
                || ("daily".equals(granularity) && cleanKey.matches("\\d{4}-\\d{2}-\\d{2}"))
                || ("weekly".equals(granularity) && cleanKey.matches("\\d{4}-W\\d{2}"))
                || ("monthly".equals(granularity) && cleanKey.matches("\\d{4}-\\d{2}")))) {
            throw new IllegalArgumentException("Invalid report periodKey");
        }
        String cleanFormat = format == null || format.trim().isEmpty() ? "both" : format.trim();
        if (!("both".equals(cleanFormat) || "json".equals(cleanFormat) || "markdown".equals(cleanFormat))) {
            throw new IllegalArgumentException("Invalid report format");
        }
        try {
            return url + "/api/reports/" + granularity + "/" + java.net.URLEncoder.encode(cleanKey, "UTF-8")
                    + "?format=" + cleanFormat;
        } catch (java.io.UnsupportedEncodingException error) { throw new IllegalStateException(error); }
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

    /** Stable destination key for SQLite quota history continuity across routine Hub CA rotations. */
    String fingerprint() {
        return digest(url + "\u0000" + secret + "\u0000" + allowHttp);
    }

    /** Trust-bound destination key (includes pinned CA fingerprint) for background monitoring and notifications. */
    String trustFingerprint() {
        return digest(url + "\u0000" + secret + "\u0000" + allowHttp + "\u0000" + caFingerprintSha256);
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
