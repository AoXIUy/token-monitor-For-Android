package com.tokenmonitor.android;

/** Fixed public release identity and portable update scheduling rules. */
final class AppUpdatePolicy {
    static final String RELEASES = "https://github.com/AoXIUy/token-monitor-For-Android/releases";
    static final String API = "https://api.github.com/repos/AoXIUy/token-monitor-For-Android/releases/latest";
    static final long CHECK_INTERVAL = 12 * 60 * 60 * 1000L;

    static String version(String tag) {
        if (tag == null || !tag.matches("v?(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})")) {
            throw new IllegalArgumentException("无法识别正式版本号");
        }
        return tag.startsWith("v") ? tag.substring(1) : tag;
    }

    static boolean newer(String candidate, String installed) {
        String[] next = version(candidate).split("\\.");
        String[] current = version(installed).split("\\.");
        for (int i = 0; i < 3; i++) {
            int left = Integer.parseInt(next[i]);
            int right = Integer.parseInt(current[i]);
            if (left != right) return left > right;
        }
        return false;
    }

    static String apkName(String tag) { return "Token-Monitor-Android-" + version(tag) + ".apk"; }
    static String apkUrl(String tag) { return RELEASES + "/download/v" + version(tag) + "/" + apkName(tag); }
    static String releaseUrl(String tag) { return RELEASES + "/tag/v" + version(tag); }

    static boolean due(boolean automatic, boolean manual, long lastAttempt, long now) {
        return manual || (automatic && (lastAttempt <= 0 || now < lastAttempt || now - lastAttempt >= CHECK_INTERVAL));
    }
}
