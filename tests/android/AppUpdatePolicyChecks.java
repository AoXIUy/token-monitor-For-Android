package com.tokenmonitor.android;

public final class AppUpdatePolicyChecks {
    private static int checks;
    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("Update policy check " + (checks + 1) + " failed");
        checks++;
    }
    public static void main(String[] args) {
        check(AppUpdatePolicy.newer("v1.10.0", "1.9.9"));
        check(AppUpdatePolicy.newer("2.0.0", "1.99.99"));
        check(AppUpdatePolicy.newer("1.0.10", "1.0.9"));
        check(!AppUpdatePolicy.newer("1.0.8", "1.0.8"));
        check(!AppUpdatePolicy.newer("1.0.7", "1.0.8"));
        for (String invalid : new String[] { "1.2.3-beta", "v1.02.3", "1.2", "v1.2.3/evil", "1.2.3?x=1", "999999999999.0.0", "" }) {
            try { AppUpdatePolicy.version(invalid); throw new AssertionError("Accepted invalid version " + invalid); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        check(AppUpdatePolicy.apkUrl("v1.0.8").equals("https://github.com/AoXIUy/token-monitor-For-Android/releases/download/v1.0.8/Token-Monitor-Android-1.0.8.apk"));
        check(AppUpdatePolicy.due(true, false, 0, 100));
        check(!AppUpdatePolicy.due(false, false, 0, 100));
        check(AppUpdatePolicy.due(false, true, 100, 101));
        check(!AppUpdatePolicy.due(true, false, 100, 100 + AppUpdatePolicy.CHECK_INTERVAL - 1));
        check(AppUpdatePolicy.due(true, false, 100, 100 + AppUpdatePolicy.CHECK_INTERVAL));
        check(AppUpdatePolicy.due(true, false, 100, 99));
        System.out.println(checks + " update policy checks passed");
    }
}
