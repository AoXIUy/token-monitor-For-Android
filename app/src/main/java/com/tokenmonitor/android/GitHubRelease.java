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

    private GitHubRelease(String version, String name, String notes, String publishedAt, long size) {
        this.version = version;
        this.name = name;
        this.notes = notes;
        this.publishedAt = publishedAt;
        this.size = size;
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
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if (!AppUpdatePolicy.apkName(tag).equals(asset.optString("name"))) continue;
            if (apk != null || !AppUpdatePolicy.apkUrl(tag).equals(asset.getString("browser_download_url"))
                    || asset.getLong("size") <= 0 || !"uploaded".equals(asset.getString("state"))) {
                throw new IllegalArgumentException("更新安装包来源或状态无效");
            }
            apk = asset;
        }
        if (apk == null) throw new IllegalArgumentException("最新正式版本暂未提供 APK");
        return new GitHubRelease(version, bounded(data.optString("name"), 160),
                bounded(data.optString("body"), 12000), bounded(data.optString("published_at"), 40), apk.getLong("size"));
    }

    JSONObject cache() throws Exception {
        return new JSONObject().put("tag_name", "v" + version).put("draft", false).put("prerelease", false)
                .put("html_url", AppUpdatePolicy.releaseUrl(version)).put("name", name).put("body", notes)
                .put("published_at", publishedAt).put("assets", new JSONArray().put(new JSONObject()
                        .put("name", AppUpdatePolicy.apkName(version)).put("state", "uploaded").put("size", size)
                        .put("browser_download_url", AppUpdatePolicy.apkUrl(version))));
    }

    private static String bounded(String value, int limit) { return value.length() <= limit ? value : value.substring(0, limit); }
}
