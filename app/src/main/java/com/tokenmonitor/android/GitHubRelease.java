package com.tokenmonitor.android;

import org.json.JSONArray;
import org.json.JSONObject;

/** Only a published stable release with the expected repository APK is actionable. */
final class GitHubRelease {
    final String version;
    final String name;
    final String notes;
    final String publishedAt;
    final long size;
    final long metadataSize;
    final String sha256;

    private GitHubRelease(String version, String name, String notes, String publishedAt, long size, long metadataSize, String sha256) {
        this.version = version;
        this.name = name;
        this.notes = notes;
        this.publishedAt = publishedAt;
        this.size = size;
        this.metadataSize = metadataSize;
        this.sha256 = sha256;
    }

    static GitHubRelease parse(JSONObject data) throws Exception {
        if (data.getBoolean("draft") || data.getBoolean("prerelease")) throw new IllegalArgumentException("仅检查正式发布版本");
        String tag = data.getString("tag_name");
        String version = AppUpdatePolicy.version(tag);
        if (!tag.equals("v" + version) || !AppUpdatePolicy.releaseUrl(tag).equals(data.getString("html_url"))) {
            throw new IllegalArgumentException("更新版本来源不匹配");
        }
        JSONArray assets = data.getJSONArray("assets");
        JSONObject apk = null;
        JSONObject metadata = null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if ("release-metadata.json".equals(asset.optString("name"))) {
                if (metadata != null || !AppUpdatePolicy.metadataUrl(tag).equals(asset.getString("browser_download_url"))
                        || !"uploaded".equals(asset.getString("state")) || asset.getLong("size") <= 0
                        || asset.getLong("size") > ApkUpdatePolicy.MAX_METADATA_BYTES) throw new IllegalArgumentException("发布校验附件无效");
                metadata = asset;
            }
            if (!AppUpdatePolicy.apkName(tag).equals(asset.optString("name"))) continue;
            if (apk != null || !AppUpdatePolicy.apkUrl(tag).equals(asset.getString("browser_download_url"))
                    || asset.getLong("size") <= 0 || asset.getLong("size") > ApkUpdatePolicy.MAX_APK_BYTES || !"uploaded".equals(asset.getString("state"))) {
                throw new IllegalArgumentException("更新安装包来源或状态无效");
            }
            apk = asset;
        }
        if (apk == null || metadata == null) throw new IllegalArgumentException("最新正式版本暂未提供 APK 或发布校验信息");
        String digest = apk.isNull("digest") ? "" : apk.optString("digest", "");
        if (!digest.isEmpty() && !digest.matches("sha256:[a-f0-9]{64}")) throw new IllegalArgumentException("安装包摘要无效");
        return new GitHubRelease(version, bounded(data.optString("name"), 160),
                bounded(data.optString("body"), 12000), bounded(data.optString("published_at"), 40), apk.getLong("size"),
                metadata.getLong("size"), digest.isEmpty() ? "" : digest.substring(7));
    }

    JSONObject cache() throws Exception {
        return new JSONObject().put("tag_name", "v" + version).put("draft", false).put("prerelease", false)
                .put("html_url", AppUpdatePolicy.releaseUrl(version)).put("name", name).put("body", notes)
                .put("published_at", publishedAt).put("assets", new JSONArray().put(new JSONObject()
                        .put("name", AppUpdatePolicy.apkName(version)).put("state", "uploaded").put("size", size)
                        .put("digest", sha256.isEmpty() ? "" : "sha256:" + sha256).put("browser_download_url", AppUpdatePolicy.apkUrl(version)))
                        .put(new JSONObject().put("name", "release-metadata.json").put("state", "uploaded").put("size", metadataSize)
                                .put("browser_download_url", AppUpdatePolicy.metadataUrl(version))));
    }

    private static String bounded(String value, int limit) { return value.length() <= limit ? value : value.substring(0, limit); }
}
