package com.tokenmonitor.android;

import java.nio.file.Files;
import java.nio.file.Path;

public final class ApkUpdatePolicyChecks {
    private static int checks;
    private static void check(boolean valid) { if (!valid) throw new AssertionError("APK policy check " + checks); checks++; }
    private static void rejects(Runnable action) {
        try { action.run(); throw new AssertionError("Accepted an untrusted APK"); }
        catch (SecurityException expected) { checks++; }
    }
    public static void main(String[] args) throws Exception {
        String original = AppUpdatePolicy.apkUrl("2.0.0");
        check(ApkUpdatePolicy.allowedRedirect(original, original));
        check(ApkUpdatePolicy.allowedRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/1?signature=x", original));
        check(ApkUpdatePolicy.allowedRedirect("https://objects.githubusercontent.com/path", original));
        for (String bad : new String[] {"http://release-assets.githubusercontent.com/x", "https://release-assets.githubusercontent.com.evil.test/x",
                "https://user@release-assets.githubusercontent.com/x", "https://release-assets.githubusercontent.com:444/x", "https://evil.test/x",
                "https://github.com/another/repo/releases/download/v2.0.0/a.apk", original + "?override=1", original + "#fragment", "file:///tmp/app.apk"}) {
            check(!ApkUpdatePolicy.allowedRedirect(bad, original));
        }
        String pin = "a".repeat(64);
        ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 20, false, pin, 1, pin, 19, "2.0.0", 20, pin); checks++;
        rejects(() -> ApkUpdatePolicy.verifyIdentity("another.app", "2.0.0", 20, false, pin, 1, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "1.9.0", 20, false, pin, 1, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 19, false, pin, 1, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 20, true, pin, 1, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 20, false, "b".repeat(64), 1, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 20, false, pin, 2, pin, 19, "2.0.0", 20, pin));
        rejects(() -> ApkUpdatePolicy.verifyIdentity(ApkUpdatePolicy.PACKAGE_NAME, "2.0.0", 20, false, pin, 1, "b".repeat(64), 19, "2.0.0", 20, pin));
        Path file = Files.createTempFile("update-policy-", ".apk");
        try {
            byte[] bytes = {1, 2, 3, 4};
            Files.write(file, bytes);
            ApkUpdatePolicy.verifyFile(file.toFile(), bytes.length, ApkUpdatePolicy.hash(bytes)); checks++;
            for (long size : new long[] {0, 3, ApkUpdatePolicy.MAX_APK_BYTES + 1}) {
                try { ApkUpdatePolicy.verifyFile(file.toFile(), size, ApkUpdatePolicy.hash(bytes)); throw new AssertionError("Accepted bad size"); }
                catch (java.io.IOException expected) { checks++; }
            }
            try { ApkUpdatePolicy.verifyFile(file.toFile(), 4, "0".repeat(64)); throw new AssertionError("Accepted wrong hash"); }
            catch (SecurityException expected) { checks++; }
        } finally { Files.deleteIfExists(file); }
        System.out.println(checks + " APK update policy checks passed");
    }
}
