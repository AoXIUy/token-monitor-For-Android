package com.tokenmonitor.android;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Locale;

/** Portable update trust rules, independent of Android and Hub credentials. */
final class ApkUpdatePolicy {
    static final long MAX_APK_BYTES = 128 * 1024 * 1024L;
    static final int MAX_METADATA_BYTES = 16384;
    static final String PACKAGE_NAME = "com.tokenmonitor.android";

    static boolean allowedRedirect(String address, String original) {
        try {
            URI uri = new URI(address);
            if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            if ("github.com".equals(uri.getHost())) return address.equals(original);
            return ("release-assets.githubusercontent.com".equals(uri.getHost()) || "objects.githubusercontent.com".equals(uri.getHost()))
                    && uri.getRawPath() != null && uri.getRawPath().startsWith("/");
        } catch (Exception ignored) { return false; }
    }

    static String hash(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return hex(digest);
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder();
        for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item & 255));
        return value.toString();
    }

    static void verifyFile(File apk, long size, String expectedHash) throws Exception {
        if (size <= 0 || size > MAX_APK_BYTES || !apk.isFile() || apk.length() != size
                || expectedHash == null || !expectedHash.matches("[a-f0-9]{64}")) throw new IOException("安装包大小或校验信息无效，请重新下载");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(apk)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new IOException("下载已取消");
                digest.update(buffer, 0, count);
            }
        }
        if (!hex(digest.digest()).equals(expectedHash)) throw new SecurityException("安装包 SHA-256 校验失败，请重新下载");
    }

    static void verifyIdentity(String packageName, String version, long code, boolean debuggable,
                               String signer, int signerCount, String installedSigner, long installedCode,
                               String expectedVersion, long expectedCode, String pinnedCertificate) {
        if (!PACKAGE_NAME.equals(packageName) || !expectedVersion.equals(version) || code != expectedCode || code <= installedCode || debuggable) {
            throw new SecurityException("安装包的应用、版本或发布类型不匹配，已阻止安装");
        }
        if (signerCount != 1 || !pinnedCertificate.equals(signer)) throw new SecurityException("安装包不是原有正式签名，已阻止安装");
        if (!pinnedCertificate.equals(installedSigner)) throw new SecurityException("当前应用签名与正式版不同，无法覆盖升级");
    }
}
