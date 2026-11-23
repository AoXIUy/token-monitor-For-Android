package com.tokenmonitor.android;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** Standalone JDK 17 tests for CertificateTrustPolicy parsing, key strength, protocol filtering, and TLS handshakes. */
public final class CertificateTrustPolicyChecks {
    private static final char[] STORE_PASS = "changeit".toCharArray();
    private static int checks;

    private static String keytoolBinary() {
        String javaHome = System.getProperty("java.home");
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        Path bin = Paths.get(javaHome, "bin", windows ? "keytool.exe" : "keytool");
        return Files.isExecutable(bin) ? bin.toString() : "keytool";
    }

    private static void keytool(Path dir, String... args) throws Exception {
        String[] cmd = new String[args.length + 1];
        cmd[0] = keytoolBinary();
        System.arraycopy(args, 0, cmd, 1, args.length);
        Process proc = new ProcessBuilder(cmd).directory(dir.toFile()).redirectErrorStream(true).start();
        String output;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append('\n');
            output = sb.toString();
        }
        int code = proc.waitFor();
        if (code != 0) {
            throw new IllegalStateException("keytool failed (" + code + "): " + Arrays.toString(args) + "\n" + output);
        }
    }

    private static void expectRejectImport(byte[] raw, String label) {
        try {
            CertificateTrustPolicy.parseForImport(raw, new Date());
        } catch (IllegalArgumentException expected) {
            checks++;
            return;
        }
        throw new AssertionError("Expected parseForImport to reject: " + label);
    }

    private static SSLServerSocket startTlsServer(Path pkcs12Path) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(pkcs12Path.toFile())) {
            ks.load(in, STORE_PASS);
        }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, STORE_PASS);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), null, null);
        SSLServerSocket server = (SSLServerSocket) ctx.getServerSocketFactory()
                .createServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
        server.setEnabledProtocols(CertificateTrustPolicy.Tls12PlusSocketFactory
                .filterProtocols(server.getSupportedProtocols()));
        Thread worker = new Thread(() -> {
            while (!server.isClosed()) {
                try (SSLSocket socket = (SSLSocket) server.accept()) {
                    socket.setSoTimeout(3000);
                    socket.startHandshake();
                    BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    String line;
                    while ((line = in.readLine()) != null && !line.isEmpty()) { /* consume headers */ }
                    byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                    String header = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                            + body.length + "\r\nConnection: close\r\n\r\n";
                    OutputStream out = socket.getOutputStream();
                    out.write(header.getBytes(StandardCharsets.US_ASCII));
                    out.write(body);
                    out.flush();
                } catch (IOException ignored) {
                    // Handshake failure or socket close on negative tests / shutdown.
                }
            }
        }, "tls-check-server");
        worker.setDaemon(true);
        worker.start();
        return server;
    }

    private static int httpsGet(int port, SSLSocketFactory factory) throws IOException {
        HttpsURLConnection conn = (HttpsURLConnection) new URL("https://127.0.0.1:" + port + "/api/stats").openConnection();
        conn.setConnectTimeout(3000);
        conn.setReadTimeout(3000);
        conn.setInstanceFollowRedirects(false);
        conn.setSSLSocketFactory(factory);
        try {
            return conn.getResponseCode();
        } finally {
            conn.disconnect();
        }
    }

    private static void expectTlsFailure(int port, SSLSocketFactory factory, String label) {
        try {
            int code = httpsGet(port, factory);
            throw new AssertionError("Expected TLS failure (" + label + ") but got HTTP " + code);
        } catch (SSLException expected) {
            checks++;
        } catch (IOException error) {
            throw new AssertionError("Expected SSLException (" + label + ") but got " + error, error);
        }
    }

    public static void main(String[] args) throws Exception {
        Path tmp = Files.createTempDirectory("token-monitor-cert-checks-");
        try {
            runAll(tmp);
        } finally {
            Files.walk(tmp).sorted(Comparator.reverseOrder()).map(Path::toFile).forEach(File::delete);
        }
        System.out.println(checks + " certificate trust policy checks passed");
    }

    private static void runAll(Path tmp) throws Exception {
        // 1. Generate Root CA A (RSA 2048, CA:TRUE)
        Path caAStore = tmp.resolve("ca-a.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", caAStore.toString(),
                "-storepass", "changeit", "-alias", "ca-a", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=Token Monitor Test CA A, O=TestOrg",
                "-validity", "365", "-ext", "bc:c=ca:true", "-ext", "ku:c=keyCertSign,cRLSign");
        Path caAPemPath = tmp.resolve("ca-a.pem");
        Path caADerPath = tmp.resolve("ca-a.der");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", caAStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-file", caAPemPath.toString());
        keytool(tmp, "-exportcert", "-keystore", caAStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-file", caADerPath.toString());

        // 2. Generate Server Leaf signed by CA A with SAN IP:127.0.0.1
        Path srvAStore = tmp.resolve("srv-a.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", srvAStore.toString(),
                "-storepass", "changeit", "-alias", "srv", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=127.0.0.1", "-validity", "365");
        keytool(tmp, "-certreq", "-keystore", srvAStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("srv-a.csr").toString());
        keytool(tmp, "-gencert", "-rfc", "-keystore", caAStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-infile", tmp.resolve("srv-a.csr").toString(),
                "-outfile", tmp.resolve("srv-a.pem").toString(), "-validity", "365",
                "-ext", "bc:c=ca:false", "-ext", "san=ip:127.0.0.1,dns:localhost", "-ext", "eku=serverAuth");
        keytool(tmp, "-importcert", "-noprompt", "-keystore", srvAStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-file", caAPemPath.toString());
        keytool(tmp, "-importcert", "-noprompt", "-keystore", srvAStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("srv-a.pem").toString());

        // 3. Generate Server Leaf signed by CA A with WRONG SAN (DNS:wrong.example.com)
        Path srvWrongSanStore = tmp.resolve("srv-wrong-san.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", srvWrongSanStore.toString(),
                "-storepass", "changeit", "-alias", "srv", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=wrong.example.com", "-validity", "365");
        keytool(tmp, "-certreq", "-keystore", srvWrongSanStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("srv-wrong.csr").toString());
        keytool(tmp, "-gencert", "-rfc", "-keystore", caAStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-infile", tmp.resolve("srv-wrong.csr").toString(),
                "-outfile", tmp.resolve("srv-wrong.pem").toString(), "-validity", "365",
                "-ext", "bc:c=ca:false", "-ext", "san=dns:wrong.example.com", "-ext", "eku=serverAuth");
        keytool(tmp, "-importcert", "-noprompt", "-keystore", srvWrongSanStore.toString(), "-storepass", "changeit",
                "-alias", "ca-a", "-file", caAPemPath.toString());
        keytool(tmp, "-importcert", "-noprompt", "-keystore", srvWrongSanStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("srv-wrong.pem").toString());

        // 4. Generate unrelated Root CA B
        Path caBStore = tmp.resolve("ca-b.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", caBStore.toString(),
                "-storepass", "changeit", "-alias", "ca-b", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=Token Monitor Test CA B", "-validity", "365",
                "-ext", "bc:c=ca:true", "-ext", "ku:c=keyCertSign,cRLSign");
        Path caBPemPath = tmp.resolve("ca-b.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", caBStore.toString(), "-storepass", "changeit",
                "-alias", "ca-b", "-file", caBPemPath.toString());

        // 5. Direct self-signed server leaf (CA:FALSE, SAN IP:127.0.0.1)
        Path selfLeafStore = tmp.resolve("self-leaf.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", selfLeafStore.toString(),
                "-storepass", "changeit", "-alias", "leaf", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=127.0.0.1", "-validity", "365",
                "-ext", "bc:c=ca:false", "-ext", "san=ip:127.0.0.1", "-ext", "eku=serverAuth");
        Path selfLeafPemPath = tmp.resolve("self-leaf.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", selfLeafStore.toString(), "-storepass", "changeit",
                "-alias", "leaf", "-file", selfLeafPemPath.toString());

        // 6. Another server cert signed by self-leaf's key (must NOT be trusted when pinning CA:FALSE self-leaf!)
        Path forgedStore = tmp.resolve("forged.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", forgedStore.toString(),
                "-storepass", "changeit", "-alias", "srv", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=127.0.0.1", "-validity", "365");
        keytool(tmp, "-certreq", "-keystore", forgedStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("forged.csr").toString());
        keytool(tmp, "-gencert", "-rfc", "-keystore", selfLeafStore.toString(), "-storepass", "changeit",
                "-alias", "leaf", "-infile", tmp.resolve("forged.csr").toString(),
                "-outfile", tmp.resolve("forged.pem").toString(), "-validity", "365",
                "-ext", "bc:c=ca:false", "-ext", "san=ip:127.0.0.1", "-ext", "eku=serverAuth");
        keytool(tmp, "-importcert", "-noprompt", "-keystore", forgedStore.toString(), "-storepass", "changeit",
                "-alias", "leaf", "-file", selfLeafPemPath.toString());
        keytool(tmp, "-importcert", "-noprompt", "-keystore", forgedStore.toString(), "-storepass", "changeit",
                "-alias", "srv", "-file", tmp.resolve("forged.pem").toString());

        // 7. EC P-256 CA, Weak RSA-1024 CA, Expired self-signed leaf, Future CA
        Path ecCaStore = tmp.resolve("ec-ca.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", ecCaStore.toString(),
                "-storepass", "changeit", "-alias", "ec", "-keyalg", "EC", "-keysize", "256",
                "-dname", "CN=EC P256 CA", "-validity", "365", "-ext", "bc:c=ca:true");
        Path ecCaPemPath = tmp.resolve("ec-ca.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", ecCaStore.toString(), "-storepass", "changeit",
                "-alias", "ec", "-file", ecCaPemPath.toString());

        Path weakStore = tmp.resolve("weak.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", weakStore.toString(),
                "-storepass", "changeit", "-alias", "weak", "-keyalg", "RSA", "-keysize", "1024",
                "-dname", "CN=Weak RSA 1024", "-validity", "365", "-ext", "bc:c=ca:true");
        Path weakPemPath = tmp.resolve("weak.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", weakStore.toString(), "-storepass", "changeit",
                "-alias", "weak", "-file", weakPemPath.toString());

        Path expiredStore = tmp.resolve("expired.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", expiredStore.toString(),
                "-storepass", "changeit", "-alias", "exp", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=127.0.0.1", "-startdate", "-2y", "-validity", "30",
                "-ext", "bc:c=ca:false", "-ext", "san=ip:127.0.0.1");
        Path expiredPemPath = tmp.resolve("expired.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", expiredStore.toString(), "-storepass", "changeit",
                "-alias", "exp", "-file", expiredPemPath.toString());

        Path futureStore = tmp.resolve("future.p12");
        keytool(tmp, "-genkeypair", "-storetype", "PKCS12", "-keystore", futureStore.toString(),
                "-storepass", "changeit", "-alias", "fut", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=Future CA", "-startdate", "+1y", "-validity", "30", "-ext", "bc:c=ca:true");
        Path futurePemPath = tmp.resolve("future.pem");
        keytool(tmp, "-exportcert", "-rfc", "-keystore", futureStore.toString(), "-storepass", "changeit",
                "-alias", "fut", "-file", futurePemPath.toString());

        byte[] caAPemBytes = Files.readAllBytes(caAPemPath);
        byte[] caADerBytes = Files.readAllBytes(caADerPath);
        String caAPem = new String(caAPemBytes, StandardCharsets.UTF_8);
        String caBPem = new String(Files.readAllBytes(caBPemPath), StandardCharsets.UTF_8);
        String selfLeafPem = new String(Files.readAllBytes(selfLeafPemPath), StandardCharsets.UTF_8);
        String expiredPem = new String(Files.readAllBytes(expiredPemPath), StandardCharsets.UTF_8);

        // Parse & canonicalization checks (PEM vs DER must match identically)
        CertificateTrustPolicy.ParsedBundle fromPem = CertificateTrustPolicy.parseForImport(caAPemBytes);
        CertificateTrustPolicy.ParsedBundle fromDer = CertificateTrustPolicy.parseForImport(caADerBytes);
        if (!fromPem.fingerprintSha256.equals(fromDer.fingerprintSha256)) {
            throw new AssertionError("PEM and DER fingerprints diverged");
        }
        if (!fromPem.canonicalPem.equals(fromDer.canonicalPem)) {
            throw new AssertionError("PEM and DER canonical PEM diverged");
        }
        if (fromPem.fingerprintSha256.length() != 64 || !fromPem.isCa || !fromPem.subject.contains("Token Monitor Test CA A")) {
            throw new AssertionError("Unexpected CA A metadata: " + fromPem.subject);
        }
        checks += 3;

        // Self-signed leaf metadata has isCa == false
        CertificateTrustPolicy.ParsedBundle parsedLeaf = CertificateTrustPolicy.parseForImport(Files.readAllBytes(selfLeafPemPath));
        if (parsedLeaf.isCa || parsedLeaf.certCount != 1) {
            throw new AssertionError("Self-signed leaf must have isCa=false and certCount=1");
        }
        checks++;

        // EC P-256 CA accepted
        CertificateTrustPolicy.ParsedBundle parsedEc = CertificateTrustPolicy.parseForImport(Files.readAllBytes(ecCaPemPath));
        if (parsedEc.fingerprintSha256.length() != 64) throw new AssertionError("EC P-256 fingerprint invalid");
        checks++;

        // Multi-cert bundle up to 4 certs accepted; 5 rejected
        String fourCerts = caAPem + "\n" + caBPem + "\n" + caAPem + "\n" + caBPem;
        CertificateTrustPolicy.ParsedBundle bundle4 = CertificateTrustPolicy.parseForImport(fourCerts.getBytes(StandardCharsets.UTF_8));
        if (bundle4.certCount != 4) throw new AssertionError("Expected 4 certs in bundle");
        checks++;
        expectRejectImport((fourCerts + "\n" + caAPem).getBytes(StandardCharsets.UTF_8), "5 certs > MAX_CERT_COUNT");

        // Negative parser checks
        expectRejectImport(new byte[0], "empty");
        expectRejectImport(new byte[CertificateTrustPolicy.MAX_CERT_BYTES + 1], "oversized > 24 KiB");
        expectRejectImport((caAPem + "\n-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n").getBytes(StandardCharsets.UTF_8), "private key mixed");
        expectRejectImport("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n".getBytes(StandardCharsets.UTF_8), "RSA private key");
        expectRejectImport("-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n".getBytes(StandardCharsets.UTF_8), "CSR block");
        expectRejectImport("not a cert at all".getBytes(StandardCharsets.UTF_8), "garbage text");
        byte[] derWithTrailing = Arrays.copyOf(caADerBytes, caADerBytes.length + 4);
        derWithTrailing[derWithTrailing.length - 1] = 0x42;
        expectRejectImport(derWithTrailing, "DER with trailing bytes");
        expectRejectImport(Files.readAllBytes(weakPemPath), "weak RSA-1024");
        expectRejectImport(Files.readAllBytes(expiredPemPath), "expired certificate");
        expectRejectImport(Files.readAllBytes(futurePemPath), "not-yet-valid certificate");

        // Stored expired PEM still parses for profile UI editing/removal
        CertificateTrustPolicy.ParsedBundle storedExpired = CertificateTrustPolicy.parseStoredPem(expiredPem);
        if (storedExpired.certCount != 1) throw new AssertionError("parseStoredPem should parse expired stored PEM");
        checks++;

        // Protocol filtering checks
        String[] filteredBoth = CertificateTrustPolicy.Tls12PlusSocketFactory.filterProtocols(
                new String[] { "SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3" });
        if (!Arrays.equals(filteredBoth, new String[] { "TLSv1.3", "TLSv1.2" })) {
            throw new AssertionError("Unexpected filtered protocols: " + Arrays.toString(filteredBoth));
        }
        String[] filtered12 = CertificateTrustPolicy.Tls12PlusSocketFactory.filterProtocols(
                new String[] { "TLSv1", "TLSv1.1", "TLSv1.2" });
        if (!Arrays.equals(filtered12, new String[] { "TLSv1.2" })) {
            throw new AssertionError("Expected TLSv1.2 only: " + Arrays.toString(filtered12));
        }
        try {
            CertificateTrustPolicy.Tls12PlusSocketFactory.filterProtocols(new String[] { "SSLv3", "TLSv1", "TLSv1.1" });
            throw new AssertionError("Should fail when neither TLS 1.2 nor 1.3 is supported");
        } catch (IllegalStateException expected) {
            checks += 3;
        }

        // Live loopback TLS handshake checks
        SSLSocketFactory defaultBefore = HttpsURLConnection.getDefaultSSLSocketFactory();
        SSLSocketFactory pinCaA = CertificateTrustPolicy.createPinnedSocketFactory(caAPem);
        SSLSocketFactory pinCaB = CertificateTrustPolicy.createPinnedSocketFactory(caBPem);
        SSLSocketFactory pinSelfLeaf = CertificateTrustPolicy.createPinnedSocketFactory(selfLeafPem);
        SSLSocketFactory pinExpiredLeaf = CertificateTrustPolicy.createPinnedSocketFactory(expiredPem);
        SSLSocketFactory systemFactory = CertificateTrustPolicy.createSystemSocketFactory();

        try (SSLServerSocket srvA = startTlsServer(srvAStore)) {
            if (httpsGet(srvA.getLocalPort(), pinCaA) != 200) throw new AssertionError("Pinned CA A handshake failed");
            checks++;
            expectTlsFailure(srvA.getLocalPort(), pinCaB, "wrong pinned CA B");
            expectTlsFailure(srvA.getLocalPort(), systemFactory, "system CA against private CA");
            expectTlsFailure(srvA.getLocalPort(), pinSelfLeaf, "unrelated pinned leaf");
        }

        try (SSLServerSocket srvWrongSan = startTlsServer(srvWrongSanStore)) {
            expectTlsFailure(srvWrongSan.getLocalPort(), pinCaA, "valid CA A but wrong SAN hostname");
        }

        try (SSLServerSocket srvSelf = startTlsServer(selfLeafStore)) {
            if (httpsGet(srvSelf.getLocalPort(), pinSelfLeaf) != 200) throw new AssertionError("Pinned self-signed leaf failed");
            checks++;
            expectTlsFailure(srvSelf.getLocalPort(), pinCaA, "wrong CA against self-signed leaf");
        }

        try (SSLServerSocket srvForged = startTlsServer(forgedStore)) {
            expectTlsFailure(srvForged.getLocalPort(), pinSelfLeaf, "CA:FALSE leaf must not act as PKIX CA");
        }

        try (SSLServerSocket srvExpired = startTlsServer(expiredStore)) {
            expectTlsFailure(srvExpired.getLocalPort(), pinExpiredLeaf, "expired pinned leaf rejected on handshake");
        }

        if (HttpsURLConnection.getDefaultSSLSocketFactory() != defaultBefore) {
            throw new AssertionError("Default SSLSocketFactory must never be modified");
        }
        checks++;
    }
}
