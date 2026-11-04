package com.tokenmonitor.android;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;

/** Verify bytes, archive identity, current signer and compatibility before each handoff. */
final class UpdateApkVerifier implements AppUpdateDownloads.Verifier {
    private final Context context;
    UpdateApkVerifier(Context context) { this.context = context.getApplicationContext(); }

    @SuppressWarnings("deprecation")
    private static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28) return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        return info.signatures;
    }

    @SuppressWarnings("deprecation")
    @Override public void verify(File apk, GitHubRelease release, UpdateManifest manifest) throws Exception {
        ApkUpdatePolicy.verifyFile(apk, release.size, manifest.sha256);
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), flags);
        if (archive == null || archive.applicationInfo == null) throw new SecurityException("无法验证 APK 内容，已阻止安装");
        Signature[] signers = signatures(archive), current = signatures(installed);
        String signer = signers != null && signers.length == 1 ? ApkUpdatePolicy.hash(signers[0].toByteArray()) : "";
        String currentSigner = current != null && current.length == 1 ? ApkUpdatePolicy.hash(current[0].toByteArray()) : "";
        long code = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        ApkUpdatePolicy.verifyIdentity(archive.packageName, archive.versionName, code,
                (archive.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0, signer,
                signers == null ? 0 : signers.length, currentSigner, installedCode,
                release.version, manifest.versionCode, BuildConfig.RELEASE_CERTIFICATE_SHA256);
    }
}
