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
        System.out.println(checks + " connection checks passed");
    }
}
