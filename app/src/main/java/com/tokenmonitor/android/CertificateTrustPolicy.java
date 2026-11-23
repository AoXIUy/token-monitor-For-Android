package com.tokenmonitor.android;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateFactory;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/** Pure Java 17 X.509 CA/self-signed trust validation and per-connection TLS 1.2+ socket factories. */
final class CertificateTrustPolicy {
    static final int MAX_CERT_BYTES = 24 * 1024;
    static final int MAX_CERT_COUNT = 4;

    private static final String BEGIN_MARKER = "-----BEGIN ";
    private static final String BEGIN_CERT = "-----BEGIN CERTIFICATE-----";
    private static final String END_CERT = "-----END CERTIFICATE-----";
    private static final int MAX_DISPLAY_TEXT = 160;

    private CertificateTrustPolicy() { }

    static final class ParsedBundle {
        final List<X509Certificate> certificates;
        final String canonicalPem;
        final String fingerprintSha256;
        final String subject;
        final String issuer;
        final long notBeforeMs;
        final long notAfterMs;
        final int certCount;
        final boolean isCa;

        ParsedBundle(List<X509Certificate> certificates, String canonicalPem, String fingerprintSha256,
                String subject, String issuer, long notBeforeMs, long notAfterMs, boolean isCa) {
            this.certificates = Collections.unmodifiableList(new ArrayList<>(certificates));
            this.canonicalPem = canonicalPem;
            this.fingerprintSha256 = fingerprintSha256;
            this.subject = subject;
            this.issuer = issuer;
            this.notBeforeMs = notBeforeMs;
            this.notAfterMs = notAfterMs;
            this.certCount = certificates.size();
            this.isCa = isCa;
        }
    }

    /** Strict validation for user-imported certificates (rejects expired or not-yet-valid certs). */
    static ParsedBundle parseForImport(byte[] rawBytes, Date now) {
        return parseInternal(rawBytes, now == null ? new Date() : now, true);
    }

    static ParsedBundle parseForImport(byte[] rawBytes) {
        return parseForImport(rawBytes, new Date());
    }

    /** Parse stored canonical PEM without failing on expiry so saved profiles remain editable/removable. */
    static ParsedBundle parseStoredPem(String pem) {
        if (pem == null || pem.trim().isEmpty()) {
            throw new IllegalArgumentException("证书内容为空");
        }
        return parseInternal(pem.getBytes(StandardCharsets.UTF_8), null, false);
    }

    private static ParsedBundle parseInternal(byte[] rawBytes, Date now, boolean enforceValidity) {
        if (rawBytes == null || rawBytes.length == 0) {
            throw new IllegalArgumentException("证书内容为空");
        }
        if (rawBytes.length > MAX_CERT_BYTES) {
            throw new IllegalArgumentException("证书文件超过 24 KiB 大小限制");
        }
        String latin1 = new String(rawBytes, StandardCharsets.ISO_8859_1);
        String upper = latin1.toUpperCase(Locale.ROOT);
        if (upper.contains("PRIVATE KEY")) {
            throw new IllegalArgumentException("检测到私钥内容，请仅导入公钥或 CA 证书（.pem / .crt / .der）");
        }

        List<X509Certificate> certs;
        if (latin1.contains(BEGIN_MARKER)) {
            certs = parsePemCertificates(new String(rawBytes, StandardCharsets.UTF_8));
        } else {
            certs = parseDerCertificate(rawBytes);
        }

        if (certs.isEmpty()) {
            throw new IllegalArgumentException("未找到有效的 X.509 证书");
        }
        if (certs.size() > MAX_CERT_COUNT) {
            throw new IllegalArgumentException("证书链最多支持 " + MAX_CERT_COUNT + " 个证书");
        }

        long earliestNotBefore = Long.MAX_VALUE;
        long earliestNotAfter = Long.MAX_VALUE;
        StringBuilder pemBuilder = new StringBuilder();
        Base64.Encoder pemEncoder = Base64.getMimeEncoder(64, new byte[] { '\n' });

        for (X509Certificate cert : certs) {
            validatePublicKey(cert.getPublicKey());
            if (enforceValidity && now != null) {
                try {
                    cert.checkValidity(now);
                } catch (CertificateExpiredException expired) {
                    throw new IllegalArgumentException("证书已过期，请导入有效证书");
                } catch (CertificateNotYetValidException notYet) {
                    throw new IllegalArgumentException("证书尚未生效，请检查证书有效期和设备时间");
                }
            }
            long notBefore = cert.getNotBefore() != null ? cert.getNotBefore().getTime() : 0L;
            long notAfter = cert.getNotAfter() != null ? cert.getNotAfter().getTime() : 0L;
            if (notBefore < earliestNotBefore) earliestNotBefore = notBefore;
            if (notAfter < earliestNotAfter) earliestNotAfter = notAfter;

            byte[] der;
            try {
                der = cert.getEncoded();
            } catch (CertificateException error) {
                throw new IllegalArgumentException("证书编码无效");
            }
            pemBuilder.append(BEGIN_CERT).append('\n')
                    .append(pemEncoder.encodeToString(der)).append('\n')
                    .append(END_CERT).append('\n');
        }

        String canonicalPem = pemBuilder.toString();
        if (canonicalPem.getBytes(StandardCharsets.UTF_8).length > MAX_CERT_BYTES) {
            throw new IllegalArgumentException("规范化后的证书内容超过 24 KiB 限制");
        }

        X509Certificate primary = certs.get(0);
        String fingerprint = computeBundleFingerprintSha256(certs);
        String subject = sanitizePrincipal(primary.getSubjectX500Principal() != null
                ? primary.getSubjectX500Principal().getName() : "");
        String issuer = sanitizePrincipal(primary.getIssuerX500Principal() != null
                ? primary.getIssuerX500Principal().getName() : "");
        boolean isCa = primary.getBasicConstraints() >= 0;
        return new ParsedBundle(
                certs,
                canonicalPem,
                fingerprint,
                subject,
                issuer,
                earliestNotBefore == Long.MAX_VALUE ? 0L : earliestNotBefore,
                earliestNotAfter == Long.MAX_VALUE ? 0L : earliestNotAfter,
                isCa);
    }

    private static List<X509Certificate> parsePemCertificates(String text) {
        List<X509Certificate> certs = new ArrayList<>();
        CertificateFactory factory = x509Factory();
        int searchFrom = 0;
        while (true) {
            int beginAny = text.indexOf(BEGIN_MARKER, searchFrom);
            if (beginAny < 0) break;
            if (!text.startsWith(BEGIN_CERT, beginAny)) {
                throw new IllegalArgumentException("仅支持 PEM CERTIFICATE 证书块，不支持其他 PEM 类型");
            }
            int bodyStart = beginAny + BEGIN_CERT.length();
            int endIdx = text.indexOf(END_CERT, bodyStart);
            if (endIdx < 0) {
                throw new IllegalArgumentException("PEM 证书缺少结束标记");
            }
            if (certs.size() >= MAX_CERT_COUNT) {
                throw new IllegalArgumentException("证书链最多支持 " + MAX_CERT_COUNT + " 个证书");
            }
            String body = stripWhitespace(text.substring(bodyStart, endIdx));
            if (body.isEmpty()) {
                throw new IllegalArgumentException("PEM 证书内容为空");
            }
            byte[] der;
            try {
                der = Base64.getDecoder().decode(body);
            } catch (IllegalArgumentException badBase64) {
                throw new IllegalArgumentException("PEM 证书 Base64 编码无效");
            }
            certs.add(parseSingleDer(factory, der));
            searchFrom = endIdx + END_CERT.length();
        }
        return certs;
    }

    private static List<X509Certificate> parseDerCertificate(byte[] rawBytes) {
        if (rawBytes[0] != 0x30) {
            throw new IllegalArgumentException("无法识别证书格式，请提供有效的 PEM 或 DER 编码 X.509 证书");
        }
        List<X509Certificate> list = new ArrayList<>(1);
        list.add(parseSingleDer(x509Factory(), rawBytes));
        return list;
    }

    private static X509Certificate parseSingleDer(CertificateFactory factory, byte[] der) {
        if (der == null || der.length == 0 || der[0] != 0x30) {
            throw new IllegalArgumentException("无效的 X.509 DER 证书数据");
        }
        try {
            ByteArrayInputStream input = new ByteArrayInputStream(der);
            Certificate parsed = factory.generateCertificate(input);
            if (!(parsed instanceof X509Certificate) || input.available() != 0) {
                throw new IllegalArgumentException("无效的 X.509 证书结构或包含多余字节");
            }
            return (X509Certificate) parsed;
        } catch (CertificateException error) {
            throw new IllegalArgumentException("无法解析 X.509 证书");
        }
    }

    private static CertificateFactory x509Factory() {
        try {
            return CertificateFactory.getInstance("X.509");
        } catch (CertificateException error) {
            throw new IllegalStateException("X.509 CertificateFactory unavailable", error);
        }
    }

    static void validatePublicKey(PublicKey key) {
        if (key == null) {
            throw new IllegalArgumentException("证书缺少公钥");
        }
        if (key instanceof RSAPublicKey) {
            int bits = ((RSAPublicKey) key).getModulus().bitLength();
            if (bits < 2048) {
                throw new IllegalArgumentException("RSA 证书密钥强度不足（需至少 2048 位）");
            }
            return;
        }
        if (key instanceof ECPublicKey) {
            int bits = ((ECPublicKey) key).getParams().getOrder().bitLength();
            if (bits < 256) {
                throw new IllegalArgumentException("EC 证书密钥强度不足（需至少 256 位）");
            }
            return;
        }
        String algorithm = key.getAlgorithm() == null ? "" : key.getAlgorithm().trim().toUpperCase(Locale.ROOT);
        if ("ED25519".equals(algorithm) || "ED448".equals(algorithm) || "EDDSA".equals(algorithm)
                || "1.3.101.112".equals(algorithm) || "1.3.101.113".equals(algorithm)) {
            return;
        }
        throw new IllegalArgumentException("证书公钥算法不受支持（仅支持 RSA ≥ 2048、EC ≥ 256 或 EdDSA）");
    }

    private static String computeBundleFingerprintSha256(List<X509Certificate> certs) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            if (certs.size() == 1) {
                md.update(certs.get(0).getEncoded());
            } else {
                for (X509Certificate cert : certs) {
                    byte[] der = cert.getEncoded();
                    md.update((byte) ((der.length >>> 24) & 0xff));
                    md.update((byte) ((der.length >>> 16) & 0xff));
                    md.update((byte) ((der.length >>> 8) & 0xff));
                    md.update((byte) (der.length & 0xff));
                    md.update(der);
                }
            }
            byte[] digest = md.digest();
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            }
            return hex.toString();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("SHA-256 fingerprint failed", error);
        }
    }

    private static String stripWhitespace(String raw) {
        StringBuilder out = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (!Character.isWhitespace(c)) out.append(c);
        }
        return out.toString();
    }

    private static String sanitizePrincipal(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder clean = new StringBuilder(Math.min(raw.length(), MAX_DISPLAY_TEXT));
        boolean lastSpace = false;
        for (int i = 0; i < raw.length() && clean.length() < MAX_DISPLAY_TEXT; i++) {
            char c = raw.charAt(i);
            if (Character.isISOControl(c)) continue;
            if (Character.isWhitespace(c)) {
                if (!lastSpace && clean.length() > 0) {
                    clean.append(' ');
                    lastSpace = true;
                }
            } else {
                clean.append(c);
                lastSpace = false;
            }
        }
        return clean.toString().trim();
    }

    /** Create a per-connection SSLSocketFactory trusting ONLY the imported CA/self-signed bundle, TLS 1.2+ only. */
    static SSLSocketFactory createPinnedSocketFactory(String caCertPem) throws GeneralSecurityException, IOException {
        ParsedBundle bundle = parseStoredPem(caCertPem);
        List<X509Certificate> caAnchors = new ArrayList<>();
        List<X509Certificate> leafAnchors = new ArrayList<>();
        for (X509Certificate cert : bundle.certificates) {
            if (cert.getBasicConstraints() >= 0) {
                caAnchors.add(cert);
            } else {
                leafAnchors.add(cert);
            }
        }
        X509TrustManager pkixDelegate = null;
        if (!caAnchors.isEmpty()) {
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(null, null);
            for (int i = 0; i < caAnchors.size(); i++) {
                ks.setCertificateEntry("ca-" + i, caAnchors.get(i));
            }
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);
            for (TrustManager tm : tmf.getTrustManagers()) {
                if (tm instanceof X509TrustManager) {
                    pkixDelegate = (X509TrustManager) tm;
                    break;
                }
            }
            if (pkixDelegate == null) {
                throw new GeneralSecurityException("X509TrustManager unavailable");
            }
        }
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[] { new PinnedTrustManager(pkixDelegate, caAnchors, leafAnchors) }, null);
        return new Tls12PlusSocketFactory(context.getSocketFactory());
    }

    /** Create a TLS 1.2+ SSLSocketFactory backed by the system trust store (never trusts custom Hub CAs). */
    static SSLSocketFactory createSystemSocketFactory() throws GeneralSecurityException {
        SSLContext context = SSLContext.getDefault();
        return new Tls12PlusSocketFactory(context.getSocketFactory());
    }

    /**
     * Runs standard PKIX verification against CA trust anchors (BasicConstraints CA:TRUE) first,
     * and also permits exact byte-for-byte pinned self-signed leaf certificates (CA:FALSE) without
     * promoting a CA:FALSE leaf into a PKIX trust anchor. Validity, signatures, key strength, and
     * HttpsURLConnection HostnameVerifier remain strictly enforced.
     */
    private static final class PinnedTrustManager implements X509TrustManager {
        private final X509TrustManager pkixDelegate;
        private final List<X509Certificate> caAnchors;
        private final List<X509Certificate> leafAnchors;

        PinnedTrustManager(X509TrustManager pkixDelegate,
                List<X509Certificate> caAnchors,
                List<X509Certificate> leafAnchors) {
            this.pkixDelegate = pkixDelegate;
            this.caAnchors = caAnchors;
            this.leafAnchors = leafAnchors;
        }

        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            throw new CertificateException("Client authentication is not supported");
        }

        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            if (chain == null || chain.length == 0) {
                throw new CertificateException("Empty server certificate chain");
            }
            for (X509Certificate cert : chain) {
                if (cert == null) {
                    throw new CertificateException("Null certificate in server chain");
                }
                try {
                    validatePublicKey(cert.getPublicKey());
                } catch (IllegalArgumentException weak) {
                    throw new CertificateException(weak.getMessage(), weak);
                }
            }
            CertificateException pkixError = null;
            if (pkixDelegate != null) {
                try {
                    pkixDelegate.checkServerTrusted(chain, authType);
                    return;
                } catch (CertificateException error) {
                    pkixError = error;
                }
            }
            if (matchesPinnedSelfSignedLeaf(chain[0])) {
                return;
            }
            if (pkixError != null) {
                throw pkixError;
            }
            throw new CertificateException("Server certificate did not match pinned certificate");
        }

        private boolean matchesPinnedSelfSignedLeaf(X509Certificate leaf) {
            try {
                byte[] leafDer = leaf.getEncoded();
                for (X509Certificate anchor : leafAnchors) {
                    if (!MessageDigest.isEqual(leafDer, anchor.getEncoded())) continue;
                    leaf.checkValidity();
                    leaf.verify(anchor.getPublicKey());
                    return true;
                }
            } catch (Exception ignored) {
                return false;
            }
            return false;
        }

        @Override public X509Certificate[] getAcceptedIssuers() {
            return caAnchors.toArray(new X509Certificate[0]);
        }
    }

    /** Enforces TLSv1.3 / TLSv1.2 only across API 26–36 (blocks TLSv1 / TLSv1.1 negotiation). */
    static final class Tls12PlusSocketFactory extends SSLSocketFactory {
        private final SSLSocketFactory delegate;

        Tls12PlusSocketFactory(SSLSocketFactory delegate) {
            this.delegate = delegate;
        }

        static String[] filterProtocols(String[] supported) {
            List<String> enabled = new ArrayList<>(2);
            if (supported != null) {
                for (String protocol : supported) {
                    if ("TLSv1.3".equals(protocol)) enabled.add(protocol);
                }
                for (String protocol : supported) {
                    if ("TLSv1.2".equals(protocol)) enabled.add(protocol);
                }
            }
            if (enabled.isEmpty()) {
                throw new IllegalStateException("Neither TLSv1.3 nor TLSv1.2 is supported");
            }
            return enabled.toArray(new String[0]);
        }

        private static Socket harden(Socket socket) {
            if (socket instanceof SSLSocket) {
                SSLSocket ssl = (SSLSocket) socket;
                ssl.setEnabledProtocols(filterProtocols(ssl.getSupportedProtocols()));
            }
            return socket;
        }

        @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }

        @Override public Socket createSocket() throws IOException {
            return harden(delegate.createSocket());
        }

        @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException {
            return harden(delegate.createSocket(s, host, port, autoClose));
        }

        @Override public Socket createSocket(String host, int port) throws IOException {
            return harden(delegate.createSocket(host, port));
        }

        @Override public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException {
            return harden(delegate.createSocket(host, port, localHost, localPort));
        }

        @Override public Socket createSocket(InetAddress host, int port) throws IOException {
            return harden(delegate.createSocket(host, port));
        }

        @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
            return harden(delegate.createSocket(address, port, localAddress, localPort));
        }
    }
}
