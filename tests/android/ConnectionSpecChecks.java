package com.tokenmonitor.android;

/** Standalone JDK test; no Android framework or extra test dependencies needed. */
public final class ConnectionSpecChecks {
    private static int checks;
    private static void rejects(String url, String secret, boolean allowHttp) {
        try { new ConnectionSpec(url, secret, allowHttp); }
        catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError("Accepted invalid connection: " + url);
    }
    public static void main(String[] args) {
        ConnectionSpec prefixed = new ConnectionSpec("https://monitor.example.com/proxy/", "secret", false);
        if (!prefixed.endpoint("/api/stats").equals("https://monitor.example.com/proxy/api/stats")) throw new AssertionError("Lost proxy prefix");
        checks++;
        String conversation = prefixed.conversationEndpoint("PC & 移动", "codex:rollout-2026-11-11", "");
        if (!conversation.startsWith("https://monitor.example.com/proxy/api/session-conversations?deviceId=PC+%26+")) throw new AssertionError("Unescaped device query");
        if (!conversation.endsWith("&key=codex%3Arollout-2026-11-11&cursor=")) throw new AssertionError("Invalid conversation route");
        checks++;
        for (String key : new String[] {"codex:..", "codex:../../secret", "antigravity:x/y", "codex:a\\b", "claude:example", "codex:a\n"}) {
            try { prefixed.conversationEndpoint("pc", key, ""); throw new AssertionError("Accepted invalid conversation key"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        try { prefixed.conversationEndpoint("pc", "codex:example", "https://evil.test"); throw new AssertionError("Accepted arbitrary cursor"); }
        catch (IllegalArgumentException expected) { checks++; }
        ConnectionSpec local = new ConnectionSpec("http://[::1]:17321/", "secret", true);
        if (!local.endpoint("/api/subscriptions").equals("http://[::1]:17321/api/subscriptions")) throw new AssertionError("Invalid IPv6 URL");
        checks++;
        rejects("http://192.168.1.1:17321", "secret", false);
        rejects("https://user:pass@example.com", "secret", false);
        rejects("https://example.com?secret=leaked", "secret", false);
        rejects("https://example.com/#fragment", "secret", false);
        rejects("file:///etc/hosts", "secret", true);
        rejects("https://example.com:99999", "secret", false);
        rejects("https://example.com:0", "secret", false);
        rejects("https://example.com", "", false);
        rejects("https://example.com", "secret\r\nInjected: bad", false);
        rejects("https://", "secret", false);
        if (!prefixed.endpoint("/api/sync/settings/limitAccountPresentation")
                .equals("https://monitor.example.com/proxy/api/sync/settings/limitAccountPresentation")) {
            throw new AssertionError("Missing limitAccountPresentation endpoint");
        }
        checks++;
        try { prefixed.endpoint("/api/sync/settings/other"); throw new AssertionError("Allowed arbitrary sync setting"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { prefixed.endpoint("/api/ingest"); throw new AssertionError("Allowed ingest"); }
        catch (IllegalArgumentException expected) { checks++; }
        try { prefixed.endpoint("/api/devices/device"); throw new AssertionError("Allowed mutation endpoint"); }
        catch (IllegalArgumentException expected) { checks++; }
        if (!prefixed.approvalAlertsEndpoint().equals("https://monitor.example.com/proxy/api/approval-alerts")) {
            throw new AssertionError("Invalid approval alerts endpoint: " + prefixed.approvalAlertsEndpoint());
        }
        checks++;
        if (!local.approvalAlertsEndpoint().equals("http://[::1]:17321/api/approval-alerts")) {
            throw new AssertionError("Invalid local approval alerts endpoint: " + local.approvalAlertsEndpoint());
        }
        checks++;
        if (!prefixed.reportsListEndpoint("", 50).equals("https://monitor.example.com/proxy/api/reports?limit=50")) {
            throw new AssertionError("Invalid reports list endpoint: " + prefixed.reportsListEndpoint("", 50));
        }
        checks++;
        if (!prefixed.reportsListEndpoint("weekly", 999).equals("https://monitor.example.com/proxy/api/reports?limit=100&granularity=weekly")) {
            throw new AssertionError("Invalid filtered reports list endpoint");
        }
        checks++;
        if (!prefixed.reportDetailEndpoint("weekly", "2026-W47", "both").equals("https://monitor.example.com/proxy/api/reports/weekly/2026-W47?format=both")) {
            throw new AssertionError("Invalid weekly report endpoint");
        }
        checks++;
        if (!local.reportDetailEndpoint("daily", "current", "markdown").equals("http://[::1]:17321/api/reports/daily/current?format=markdown")) {
            throw new AssertionError("Invalid daily current report endpoint");
        }
        checks++;
        for (String[] bad : new String[][] {
                {"all", "current", "both"},
                {"daily", "../../secret", "both"},
                {"daily", "2026-W47", "both"},
                {"weekly", "2026-11-16", "both"},
                {"monthly", "2026-11-16", "both"},
                {"daily", "current", "html"}
        }) {
            try { prefixed.reportDetailEndpoint(bad[0], bad[1], bad[2]); throw new AssertionError("Accepted invalid report endpoint"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        try { prefixed.reportsListEndpoint("yearly", 20); throw new AssertionError("Accepted invalid report granularity"); }
        catch (IllegalArgumentException expected) { checks++; }
        System.out.println(checks + " connection checks passed");
    }
}
