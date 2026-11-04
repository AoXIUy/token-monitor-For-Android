package com.tokenmonitor.android;

import org.json.JSONObject;

/** Release metadata is bound to the exact validated GitHub release and public signing pin. */
final class UpdateManifest {
    final String version, sha256, commit, certificate;
    final long versionCode;

    private UpdateManifest(String version, long code, String sha256, String commit, String certificate) {
        this.version = version; versionCode = code; this.sha256 = sha256; this.commit = commit; this.certificate = certificate;
    }

    static UpdateManifest parse(JSONObject data, GitHubRelease release, String pin) throws Exception {
        String hash = data.getString("sha256"), commit = data.getString("commit");
        String certificate = data.getString("certificateSha256");
        Object rawCode = data.get("versionCode");
        long code = rawCode instanceof Number ? ((Number) rawCode).longValue() : 0;
        if (!release.version.equals(data.getString("version")) || !("v" + release.version).equals(data.getString("tag"))
                || !AppUpdatePolicy.apkName(release.version).equals(data.getString("filename"))
                || !(rawCode instanceof Number) || ((Number) rawCode).doubleValue() != code || code <= 0 || code > 2100000000
                || !hash.matches("[a-f0-9]{64}") || !commit.matches("[a-f0-9]{40}")
                || !pin.matches("[a-f0-9]{64}") || !pin.equals(certificate)
                || (!release.sha256.isEmpty() && !hash.equals(release.sha256))) {
            throw new SecurityException("发布校验信息与版本、安装包或正式签名不匹配");
        }
        return new UpdateManifest(release.version, code, hash, commit, certificate);
    }

    JSONObject cache() throws Exception {
        return new JSONObject().put("version", version).put("versionCode", versionCode).put("sha256", sha256)
                .put("tag", "v" + version).put("filename", AppUpdatePolicy.apkName(version))
                .put("commit", commit).put("certificateSha256", certificate);
    }
}
