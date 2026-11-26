package com.tokenmonitor.android;

/** Standalone JDK test; no Android framework or extra test dependencies needed. */
public final class ConnectionSpecChecks {
    private static int checks;
    private static void rejects(String url, String secret, boolean allowHttp) {
        try { new ConnectionSpec(url, secret, allowHttp); }
        catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError("Accepted invalid connection: " + url);
    }
    public static void main(String[] args) throws Exception {
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
        if (!prefixed.endpoint("/api/devices").equals("https://monitor.example.com/proxy/api/devices")) {
            throw new AssertionError("Missing devices read endpoint");
        }
        checks++;
        if (!prefixed.fixedRangesIndexEndpoint("PC & 移动")
                .startsWith("https://monitor.example.com/proxy/api/fixed-ranges?deviceId=PC+%26+")) {
            throw new AssertionError("Invalid fixedRangesIndexEndpoint");
        }
        checks++;
        if (!local.fixedRangesPageEndpoint("pc-1", "rev-uuid-01", 0)
                .equals("http://[::1]:17321/api/fixed-ranges?deviceId=pc-1&revision=rev-uuid-01&page=0")) {
            throw new AssertionError("Invalid fixedRangesPageEndpoint");
        }
        checks++;
        for (String badDevice : new String[] {"", "   ", "pc\n1"}) {
            try { prefixed.fixedRangesIndexEndpoint(badDevice); throw new AssertionError("Accepted invalid fixed range deviceId"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        for (int badPage : new int[] {-1, 32, 999}) {
            try { prefixed.fixedRangesPageEndpoint("pc-1", "rev-1", badPage); throw new AssertionError("Accepted invalid fixed range page"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        for (String badRevision : new String[] {"", "  ", "rev\r\n"}) {
            try { prefixed.fixedRangesPageEndpoint("pc-1", badRevision, 0); throw new AssertionError("Accepted invalid fixed range revision"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
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
        if (!prefixed.antigravityManagerEndpoint().equals("https://monitor.example.com/proxy/api/antigravity-manager")) {
            throw new AssertionError("Invalid antigravity manager endpoint: " + prefixed.antigravityManagerEndpoint());
        }
        checks++;
        if (!local.antigravityManagerEndpoint().equals("http://[::1]:17321/api/antigravity-manager")) {
            throw new AssertionError("Invalid local antigravity manager endpoint: " + local.antigravityManagerEndpoint());
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

        // Custom CA TLS checks: generate two distinct RSA-2048 certs via keytool in a temp dir
        testCustomCaAndTrustFingerprint(prefixed);

        System.out.println(checks + " connection checks passed");
    }

    private static void testCustomCaAndTrustFingerprint(ConnectionSpec systemHttps) throws Exception {
        java.nio.file.Path tmp = java.nio.file.Files.createTempDirectory("conn-spec-ca-");
        try {
            String keytool = java.nio.file.Paths.get(System.getProperty("java.home"), "bin",
                    System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win") ? "keytool.exe" : "keytool").toString();
            String[] pems = new String[2];
            for (int i = 0; i < 2; i++) {
                java.nio.file.Path p12 = tmp.resolve("ca-" + i + ".p12");
                java.nio.file.Path pem = tmp.resolve("ca-" + i + ".pem");
                Process p1 = new ProcessBuilder(keytool, "-genkeypair", "-storetype", "PKCS12",
                        "-keystore", p12.toString(), "-storepass", "changeit", "-alias", "ca",
                        "-keyalg", "RSA", "-keysize", "2048", "-dname", "CN=ConnSpec Test CA " + i,
                        "-validity", "365", "-ext", "bc:c=ca:true").redirectErrorStream(true).start();
                if (p1.waitFor() != 0) throw new IllegalStateException("keytool genkeypair failed");
                Process p2 = new ProcessBuilder(keytool, "-exportcert", "-rfc",
                        "-keystore", p12.toString(), "-storepass", "changeit", "-alias", "ca",
                        "-file", pem.toString()).redirectErrorStream(true).start();
                if (p2.waitFor() != 0) throw new IllegalStateException("keytool exportcert failed");
                pems[i] = java.nio.file.Files.readString(pem);
            }

            ConnectionSpec withCa0 = new ConnectionSpec("https://monitor.example.com/proxy/", "secret", false, pems[0]);
            ConnectionSpec withCa1 = new ConnectionSpec("https://monitor.example.com/proxy/", "secret", false, pems[1]);
            if (!withCa0.hasCustomCa() || withCa0.caFingerprintSha256.length() != 64 || systemHttps.hasCustomCa()) {
                throw new AssertionError("Unexpected custom CA state on ConnectionSpec");
            }
            checks++;
            // LimitsHistoryStore continuity: fingerprint() must stay unchanged across system CA vs custom CA.
            if (!systemHttps.fingerprint().equals(withCa0.fingerprint()) || !withCa0.fingerprint().equals(withCa1.fingerprint())) {
                throw new AssertionError("fingerprint() must remain invariant when CA changes");
            }
            checks++;
            // Security boundary: trustFingerprint() must diverge whenever CA changes.
            if (systemHttps.trustFingerprint().equals(withCa0.trustFingerprint())
                    || withCa0.trustFingerprint().equals(withCa1.trustFingerprint())) {
                throw new AssertionError("trustFingerprint() must change when CA changes");
            }
            checks++;
            // Custom CA on plain http:// must be rejected.
            try {
                new ConnectionSpec("http://127.0.0.1:17321", "secret", true, pems[0]);
                throw new AssertionError("Accepted custom CA on plain http://");
            } catch (IllegalArgumentException expected) { checks++; }
            // Malformed CA PEM must be rejected.
            try {
                new ConnectionSpec("https://monitor.example.com", "secret", false, "not-a-cert");
                throw new AssertionError("Accepted malformed CA PEM");
            } catch (IllegalArgumentException expected) { checks++; }
        } finally {
            java.nio.file.Files.walk(tmp)
                    .sorted(java.util.Comparator.reverseOrder())
                    .map(java.nio.file.Path::toFile)
                    .forEach(java.io.File::delete);
        }
    }
}
