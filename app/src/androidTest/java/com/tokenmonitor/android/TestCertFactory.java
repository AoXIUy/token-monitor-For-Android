package com.tokenmonitor.android;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

/**
 * Generates fresh ephemeral RSA-2048 X.509 v3 test certificates in memory for instrumentation tests.
 * Avoids committing static private keys or expiring fixtures.
 */
final class TestCertFactory {
    private static final byte[] OID_SHA256_WITH_RSA = new byte[] {
            0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xf7, 0x0d, 0x01, 0x01, 0x0b };
    private static final byte[] OID_CN = new byte[] { 0x06, 0x03, 0x55, 0x04, 0x03 };
    private static final byte[] OID_BASIC_CONSTRAINTS = new byte[] { 0x06, 0x03, 0x55, 0x1d, 0x13 };
    private static final byte[] OID_KEY_USAGE = new byte[] { 0x06, 0x03, 0x55, 0x1d, 0x0f };
    private static final byte[] OID_SAN = new byte[] { 0x06, 0x03, 0x55, 0x1d, 0x11 };
    private static final byte[] OID_EXT_KEY_USAGE = new byte[] { 0x06, 0x03, 0x55, 0x1d, 0x25 };
    private static final byte[] OID_SERVER_AUTH = new byte[] { 0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01 };
    private static final byte[] DER_NULL = new byte[] { 0x05, 0x00 };
    private static final SecureRandom RANDOM = new SecureRandom();

    static final class Identity {
        final KeyPair keyPair;
        final X509Certificate cert;
        final X509Certificate[] chain;
        final String pem;

        Identity(KeyPair keyPair, X509Certificate cert, X509Certificate[] chain) throws Exception {
            this.keyPair = keyPair;
            this.cert = cert;
            this.chain = chain;
            this.pem = toPem(cert);
        }

        SSLContext serverSslContext() throws Exception {
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(null, null);
            char[] pass = "test".toCharArray();
            ks.setKeyEntry("server", keyPair.getPrivate(), pass, chain);
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, pass);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(kmf.getKeyManagers(), null, null);
            return ctx;
        }
    }

    static Identity createCa(String commonName) throws Exception {
        KeyPair kp = generateRsa2048();
        long now = System.currentTimeMillis();
        X509Certificate cert = issueCert(
                commonName,
                commonName,
                kp.getPublic(),
                kp.getPrivate(),
                new Date(now - 86_400_000L),
                new Date(now + 7L * 86_400_000L),
                true,
                null,
                null);
        return new Identity(kp, cert, new X509Certificate[] { cert });
    }

    static Identity createServerLeaf(String commonName, Identity issuerCa, String ipSan, String dnsSan) throws Exception {
        KeyPair kp = generateRsa2048();
        long now = System.currentTimeMillis();
        X509Certificate leaf = issueCert(
                commonName,
                issuerCa.cert.getSubjectX500Principal().getName().replaceFirst("^CN=", ""),
                kp.getPublic(),
                issuerCa.keyPair.getPrivate(),
                new Date(now - 86_400_000L),
                new Date(now + 7L * 86_400_000L),
                false,
                ipSan,
                dnsSan);
        return new Identity(kp, leaf, new X509Certificate[] { leaf, issuerCa.cert });
    }

    static Identity createSelfSignedLeaf(String commonName, String ipSan, String dnsSan) throws Exception {
        KeyPair kp = generateRsa2048();
        long now = System.currentTimeMillis();
        X509Certificate leaf = issueCert(
                commonName,
                commonName,
                kp.getPublic(),
                kp.getPrivate(),
                new Date(now - 86_400_000L),
                new Date(now + 7L * 86_400_000L),
                false,
                ipSan,
                dnsSan);
        return new Identity(kp, leaf, new X509Certificate[] { leaf });
    }

    static String toPem(X509Certificate cert) throws Exception {
        String b64 = Base64.getMimeEncoder(64, new byte[] { '\n' }).encodeToString(cert.getEncoded());
        return "-----BEGIN CERTIFICATE-----\n" + b64 + "\n-----END CERTIFICATE-----\n";
    }

    private static KeyPair generateRsa2048() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048, RANDOM);
        return gen.generateKeyPair();
    }

    private static X509Certificate issueCert(
            String subjectCn,
            String issuerCn,
            PublicKey subjectKey,
            PrivateKey signingKey,
            Date notBefore,
            Date notAfter,
            boolean isCa,
            String ipSan,
            String dnsSan) throws Exception {
        byte[] sigAlg = seq(concat(OID_SHA256_WITH_RSA, DER_NULL));
        byte[] version = tlv(0xa0, derInt(BigInteger.valueOf(2)));
        byte[] serial = derInt(new BigInteger(63, RANDOM).setBit(62));
        byte[] issuer = derName(issuerCn);
        byte[] validity = seq(concat(derTime(notBefore), derTime(notAfter)));
        byte[] subject = derName(subjectCn);
        byte[] spki = subjectKey.getEncoded();

        ByteArrayOutputStream extSeq = new ByteArrayOutputStream();
        // BasicConstraints (critical)
        byte[] bcVal = isCa ? seq(new byte[] { 0x01, 0x01, (byte) 0xff }) : seq(new byte[0]);
        extSeq.write(derExtension(OID_BASIC_CONSTRAINTS, true, bcVal));
        // KeyUsage (critical)
        byte[] kuBits = isCa ? new byte[] { 0x03, 0x02, 0x01, 0x06 } : new byte[] { 0x03, 0x02, 0x05, (byte) 0xa0 };
        extSeq.write(derExtension(OID_KEY_USAGE, true, kuBits));
        // ExtendedKeyUsage for server leaves
        if (!isCa) {
            extSeq.write(derExtension(OID_EXT_KEY_USAGE, false, seq(OID_SERVER_AUTH)));
        }
        // SubjectAltName
        if ((ipSan != null && !ipSan.isEmpty()) || (dnsSan != null && !dnsSan.isEmpty())) {
            ByteArrayOutputStream sanEntries = new ByteArrayOutputStream();
            if (dnsSan != null && !dnsSan.isEmpty()) {
                sanEntries.write(tlv(0x82, dnsSan.getBytes(StandardCharsets.US_ASCII)));
            }
            if (ipSan != null && !ipSan.isEmpty()) {
                sanEntries.write(tlv(0x87, InetAddress.getByName(ipSan).getAddress()));
            }
            extSeq.write(derExtension(OID_SAN, false, seq(sanEntries.toByteArray())));
        }
        byte[] extensions = tlv(0xa3, seq(extSeq.toByteArray()));

        byte[] tbs = seq(concat(version, serial, sigAlg, issuer, validity, subject, spki, extensions));

        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(signingKey);
        signer.update(tbs);
        byte[] sigBytes = signer.sign();
        byte[] sigBitString = tlv(0x03, concat(new byte[] { 0x00 }, sigBytes));

        byte[] fullCert = seq(concat(tbs, sigAlg, sigBitString));
        Certificate parsed = CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(fullCert));
        return (X509Certificate) parsed;
    }

    private static byte[] derExtension(byte[] oid, boolean critical, byte[] valueDer) {
        byte[] octets = tlv(0x04, valueDer);
        if (critical) {
            return seq(concat(oid, new byte[] { 0x01, 0x01, (byte) 0xff }, octets));
        }
        return seq(concat(oid, octets));
    }

    private static byte[] derName(String cn) {
        byte[] utf8 = tlv(0x0c, cn.getBytes(StandardCharsets.UTF_8));
        byte[] atv = seq(concat(OID_CN, utf8));
        byte[] rdn = tlv(0x31, atv);
        return seq(rdn);
    }

    private static byte[] derTime(Date date) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyMMddHHmmss'Z'", Locale.ROOT);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return tlv(0x17, fmt.format(date).getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] derInt(BigInteger value) {
        return tlv(0x02, value.toByteArray());
    }

    private static byte[] seq(byte[] content) {
        return tlv(0x30, content);
    }

    private static byte[] tlv(int tag, byte[] content) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(content.length + 6);
        out.write(tag);
        int len = content.length;
        if (len < 128) {
            out.write(len);
        } else if (len < 256) {
            out.write(0x81);
            out.write(len);
        } else if (len < 65536) {
            out.write(0x82);
            out.write((len >>> 8) & 0xff);
            out.write(len & 0xff);
        } else {
            out.write(0x83);
            out.write((len >>> 16) & 0xff);
            out.write((len >>> 8) & 0xff);
            out.write(len & 0xff);
        }
        out.write(content, 0, content.length);
        return out.toByteArray();
    }

    private static byte[] concat(byte[]... parts) {
        int total = 0;
        for (byte[] p : parts) total += p.length;
        byte[] result = new byte[total];
        int offset = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, result, offset, p.length);
            offset += p.length;
        }
        return result;
    }
}
