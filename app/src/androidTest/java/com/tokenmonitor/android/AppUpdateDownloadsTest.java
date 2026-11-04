package com.tokenmonitor.android;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.LongConsumer;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class AppUpdateDownloadsTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final byte[] payload = {1, 2, 3, 4};
    private AppUpdateDownloads downloads;
    private static void main(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private static void await(BooleanSupplier condition) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < deadline) Thread.sleep(20);
        assertTrue("Download did not reach expected state", condition.getAsBoolean());
    }
    @Before public void reset() { context.getSharedPreferences("app-update-download", 0).edit().clear().commit(); }
    @After public void close() {
        main(() -> { if (downloads != null) downloads.close(); });
        context.getSharedPreferences("app-update-download", 0).edit().clear().commit();
    }
    private GitHubRelease release(String version) throws Exception {
        return GitHubRelease.parse(new JSONObject().put("tag_name", "v" + version).put("draft", false).put("prerelease", false)
                .put("html_url", AppUpdatePolicy.releaseUrl(version)).put("assets", new JSONArray()
                        .put(new JSONObject().put("name", AppUpdatePolicy.apkName(version)).put("size", payload.length)
                                .put("state", "uploaded").put("browser_download_url", AppUpdatePolicy.apkUrl(version)))
                        .put(new JSONObject().put("name", "release-metadata.json").put("size", 512)
                                .put("state", "uploaded").put("browser_download_url", AppUpdatePolicy.metadataUrl(version)))));
    }
    private JSONObject metadata(GitHubRelease release) throws Exception {
        return new JSONObject().put("version", release.version).put("versionCode", 100).put("tag", "v" + release.version)
                .put("filename", AppUpdatePolicy.apkName(release.version)).put("sha256", ApkUpdatePolicy.hash(payload))
                .put("certificateSha256", BuildConfig.RELEASE_CERTIFICATE_SHA256).put("commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    }
    private AppUpdateDownloads.Call source() {
        return new AppUpdateDownloads.Call() {
            public JSONObject metadata(GitHubRelease release) throws Exception { return AppUpdateDownloadsTest.this.metadata(release); }
            public void download(GitHubRelease release, File file, LongConsumer progress) throws Exception {
                Files.write(file.toPath(), payload); progress.accept(payload.length);
            }
            public void cancel() { }
        };
    }

    @Test public void verifiedFilesRestoreAndRecheckBeforeEveryInstallHandoff() throws Exception {
        AtomicReference<JSONObject> state = new AtomicReference<>();
        AtomicInteger verified = new AtomicInteger(), installs = new AtomicInteger();
        AppUpdateDownloads.Verifier verifier = (file, release, proof) -> {
            ApkUpdatePolicy.verifyFile(file, release.size, proof.sha256); verified.incrementAndGet();
        };
        GitHubRelease release = release("2.0.0");
        main(() -> {
            downloads = new AppUpdateDownloads(context, "1.0.0", this::source, verifier, state::set, file -> installs.incrementAndGet());
            downloads.start(release);
        });
        await(() -> installs.get() == 1);
        assertEquals("ready", state.get().getString("phase"));
        assertEquals(1, verified.get());
        main(() -> {
            downloads.close();
            state.set(null);
            downloads = new AppUpdateDownloads(context, "1.0.0", this::source, verifier, state::set, file -> installs.incrementAndGet());
        });
        await(() -> verified.get() == 2 && state.get() != null && "ready".equals(state.get().optString("phase")));
        assertEquals(1, installs.get());
        main(() -> downloads.requestInstall());
        await(() -> verified.get() == 3 && installs.get() == 2);
        main(() -> { downloads.permissionRequired(); downloads.permissionDenied(); });
        assertEquals("permission", state.get().getString("phase"));
        assertFalse(state.get().getString("error").isEmpty());
        main(() -> { downloads.installerOpened(); downloads.resume(); });
        assertEquals("ready", state.get().getString("phase"));
        assertFalse(state.get().toString().contains("content://"));
    }

    @Test public void wrongMetadataOrHashCannotReachTheInstaller() throws Exception {
        AtomicReference<JSONObject> state = new AtomicReference<>();
        AtomicInteger installs = new AtomicInteger(), bodies = new AtomicInteger();
        GitHubRelease release = release("2.0.0");
        main(() -> {
            downloads = new AppUpdateDownloads(context, "1.0.0", () -> new AppUpdateDownloads.Call() {
                public JSONObject metadata(GitHubRelease target) throws Exception { return AppUpdateDownloadsTest.this.metadata(target).put("certificateSha256", "0000000000000000000000000000000000000000000000000000000000000000"); }
                public void download(GitHubRelease target, File file, LongConsumer progress) { bodies.incrementAndGet(); }
                public void cancel() { }
            }, (file, target, proof) -> ApkUpdatePolicy.verifyFile(file, target.size, proof.sha256), state::set, file -> installs.incrementAndGet());
            downloads.start(release);
        });
        await(() -> "error".equals(state.get().optString("phase")));
        assertEquals(0, bodies.get()); assertEquals(0, installs.get());
        main(() -> {
            downloads.close();
            downloads = new AppUpdateDownloads(context, "1.0.0", () -> new AppUpdateDownloads.Call() {
                public JSONObject metadata(GitHubRelease target) throws Exception { return AppUpdateDownloadsTest.this.metadata(target); }
                public void download(GitHubRelease target, File file, LongConsumer progress) throws Exception { Files.write(file.toPath(), new byte[] {4, 3, 2, 1}); }
                public void cancel() { }
            }, (file, target, proof) -> ApkUpdatePolicy.verifyFile(file, target.size, proof.sha256), state::set, file -> installs.incrementAndGet());
            downloads.start(release);
        });
        await(() -> "error".equals(state.get().optString("phase")));
        assertEquals(0, installs.get());
        assertEquals("", context.getSharedPreferences("app-update-download", 0).getString("verified", ""));
    }

    @Test public void cancelledLateResponsesCannotInstallOrReplaceANewerDownload() throws Exception {
        AtomicReference<JSONObject> state = new AtomicReference<>();
        AtomicInteger installs = new AtomicInteger(), requests = new AtomicInteger();
        CountDownLatch entered = new CountDownLatch(1), gate = new CountDownLatch(1);
        GitHubRelease first = release("9.0.0"), next = release("2.0.0");
        main(() -> {
            downloads = new AppUpdateDownloads(context, "1.0.0", () -> {
                int index = requests.incrementAndGet();
                return new AppUpdateDownloads.Call() {
                    public JSONObject metadata(GitHubRelease release) throws Exception { return AppUpdateDownloadsTest.this.metadata(release); }
                    public void download(GitHubRelease release, File file, LongConsumer progress) throws Exception {
                        if (index == 1) { entered.countDown(); assertTrue(gate.await(5, TimeUnit.SECONDS)); }
                        Files.write(file.toPath(), payload); progress.accept(payload.length);
                    }
                    public void cancel() { }
                };
            }, (file, release, proof) -> ApkUpdatePolicy.verifyFile(file, release.size, proof.sha256), state::set, file -> installs.incrementAndGet());
            downloads.start(first);
        });
        assertTrue(entered.await(5, TimeUnit.SECONDS));
        main(() -> { downloads.cancel(); downloads.start(next); });
        gate.countDown();
        await(() -> installs.get() == 1 && "2.0.0".equals(state.get().optString("version")));
        assertEquals("ready", state.get().getString("phase"));
        assertEquals(1, installs.get());
    }

    private static final class Response extends HttpURLConnection {
        final int status; final String location; final byte[] bytes;
        Response(int status, String location, byte[] bytes) throws Exception { super(new URL("https://github.com/")); this.status = status; this.location = location; this.bytes = bytes; }
        public int getResponseCode() { return status; }
        public String getHeaderField(String name) { return "Location".equals(name) ? location : null; }
        public long getContentLengthLong() { return bytes.length; }
        public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        public void disconnect() { }
        public void connect() { }
        public boolean usingProxy() { return false; }
    }

    @Test public void transportChecksEveryRedirectAndNeverForwardsHubAuthorization() throws Exception {
        GitHubRelease release = release("2.0.0");
        File target = new File(context.getCacheDir(), "transport-test.part");
        AtomicInteger opened = new AtomicInteger();
        Response bad = new Response(302, "https://evil.test/update.apk", new byte[0]);
        UpdateDownloadClient rejected = new UpdateDownloadClient(url -> { opened.incrementAndGet(); return bad; });
        try { rejected.download(release, target, ignored -> { }); fail("Untrusted redirect was accepted"); }
        catch (SecurityException expected) { assertEquals(1, opened.get()); }
        Response redirect = new Response(302, "https://release-assets.githubusercontent.com/file?token=test", new byte[0]);
        Response body = new Response(200, null, payload);
        opened.set(0);
        UpdateDownloadClient client = new UpdateDownloadClient(url -> opened.incrementAndGet() == 1 ? redirect : body);
        client.download(release, target, ignored -> { });
        assertEquals(2, opened.get()); assertEquals(4, target.length());
        assertNull(body.getRequestProperty("Authorization")); assertFalse(body.getInstanceFollowRedirects());
        Response shortBody = new Response(200, null, new byte[] {1});
        try { new UpdateDownloadClient(url -> shortBody).download(release, target, ignored -> { }); fail("Truncated APK was accepted"); }
        catch (java.io.IOException expected) { }
        client.cancel();
        try { client.download(release, target, ignored -> { }); fail("Cancelled call restarted"); }
        catch (java.io.IOException expected) { }
        target.delete();
    }

    @Test public void malformedRecordsAndArchivesCannotEscapePrivateStorage() throws Exception {
        File outside = new File(context.getFilesDir(), "must-not-delete.txt");
        Files.write(outside.toPath(), payload);
        context.getSharedPreferences("app-update-download", 0).edit().putString("verified", "{\"file\":\"../must-not-delete.txt\"}").commit();
        AtomicReference<JSONObject> state = new AtomicReference<>();
        main(() -> downloads = new AppUpdateDownloads(context, "1.0.0", this::source, new UpdateApkVerifier(context), state::set, file -> fail("Unexpected install")));
        await(() -> state.get() != null && "idle".equals(state.get().optString("phase")));
        assertTrue(outside.exists());
        try { MainActivity.updateInstallIntent(context, outside); fail("Provider exposed another private directory"); }
        catch (IllegalArgumentException expected) { }
        File directory = new File(context.getFilesDir(), "updates/verified"); directory.mkdirs();
        File file = new File(directory, "test.apk"); Files.write(file.toPath(), payload);
        Intent intent = MainActivity.updateInstallIntent(context, file);
        assertEquals("content", intent.getData().getScheme());
        assertEquals("application/vnd.android.package-archive", intent.getType());
        assertEquals(0, intent.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        assertTrue((intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        GitHubRelease release = release("2.0.0");
        try { new UpdateApkVerifier(context).verify(file, release, UpdateManifest.parse(metadata(release), release, BuildConfig.RELEASE_CERTIFICATE_SHA256)); fail("Non-APK bytes were accepted"); }
        catch (SecurityException expected) { }
        outside.delete(); file.delete();
    }
}
