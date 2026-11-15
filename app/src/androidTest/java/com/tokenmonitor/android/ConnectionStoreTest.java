package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class ConnectionStoreTest {
    private Context context;

    @Before public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        new ConnectionStore(context).clear();
    }

    @After public void tearDown() {
        new ConnectionStore(context).clear();
    }

    @Test public void multiHubAddSelectSaveDeleteAndDisconnectPreserveIsolation() throws Exception {
        ConnectionStore store = new ConnectionStore(context);
        assertEquals("", store.binding());
        assertNull(store.load());
        assertTrue(store.listProfiles().isEmpty());

        ConnectionSpec work = store.addProfile("Work", "https://work.example.com/", "secret-1", false);
        assertEquals("https://work.example.com", work.url);
        String workId = store.activeProfileId();
        String workBinding = store.binding();
        assertFalse(workId.isEmpty());
        assertFalse(workBinding.isEmpty());
        assertEquals("secret-1", store.load().secret);

        ConnectionSpec home = store.addProfile("Home", "http://127.0.0.1:17321/", "secret-2", true);
        assertEquals("http://127.0.0.1:17321", home.url);
        assertTrue(home.allowHttp);
        String homeId = store.activeProfileId();
        String homeBinding = store.binding();
        assertNotEquals(workId, homeId);
        assertNotEquals(workBinding, homeBinding);
        assertEquals("secret-2", store.load().secret);
        assertEquals(2, store.listProfiles().size());

        // Renaming or keeping the exact same URL + allowHttp can reuse the encrypted native secret.
        ConnectionSpec renamed = store.saveProfile(homeId, "Home Studio", "http://127.0.0.1:17321", "", true);
        assertEquals("secret-2", renamed.secret);
        assertEquals("Home Studio", store.listProfiles().get(1).name);
        String renamedBinding = store.binding();
        assertNotEquals(homeBinding, renamedBinding);

        // Changing the URL or scheme without entering a fresh secret is always rejected.
        try {
            store.saveProfile(homeId, "Hijack", "https://attacker.example.com", "", false);
            fail("Expected secret-reuse rejection when Hub URL changed");
        } catch (IllegalArgumentException expected) {
            assertEquals("http://127.0.0.1:17321", store.load().url);
            assertEquals("secret-2", store.load().secret);
        }
        try {
            store.saveProfile(homeId, "HTTPS Upgrade", "https://127.0.0.1:17321", "", false);
            fail("Expected secret-reuse rejection when Hub scheme changed");
        } catch (IllegalArgumentException expected) {
            assertEquals("http://127.0.0.1:17321", store.load().url);
            assertTrue(store.load().allowHttp);
        }

        // Switching restores the saved profile without retyping its secret.
        ConnectionSpec switched = store.selectProfile(workId);
        assertEquals("secret-1", switched.secret);
        assertEquals(workId, store.activeProfileId());
        assertEquals("https://work.example.com", store.load().url);
        assertNotEquals(renamedBinding, store.binding());

        // Disconnecting clears active credentials & binding while preserving saved Hub profiles.
        store.disconnectActive();
        assertEquals("", store.activeProfileId());
        assertEquals("", store.binding());
        assertNull(store.load());
        assertEquals(2, store.listProfiles().size());

        // Deleting an inactive profile leaves another active profile connected.
        store.selectProfile(homeId);
        String activeHomeBinding = store.binding();
        assertFalse(store.deleteProfile(workId));
        assertEquals(1, store.listProfiles().size());
        assertEquals(homeId, store.activeProfileId());
        assertEquals(activeHomeBinding, store.binding());

        // Deleting the active profile clears active credentials and binding.
        assertTrue(store.deleteProfile(homeId));
        assertTrue(store.listProfiles().isEmpty());
        assertEquals("", store.activeProfileId());
        assertEquals("", store.binding());
        assertNull(store.load());
    }

    @Test public void migratesLegacySingleConnectionToMultiHubStore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        SecretKey key;
        if (ks.containsAlias("token-monitor-hub-v1")) {
            key = (SecretKey) ks.getKey("token-monitor-hub-v1", null);
        } else {
            KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("token-monitor-hub-v1",
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            key = gen.generateKey();
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        JSONObject legacyPayload = new JSONObject()
                .put("url", "https://legacy.example.com")
                .put("secret", "legacy-secret")
                .put("allowHttp", false);
        String encrypted = Base64.encodeToString(
                cipher.doFinal(legacyPayload.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);

        SharedPreferences prefs = context.getSharedPreferences("hub-connection", Context.MODE_PRIVATE);
        assertTrue(prefs.edit().clear().putString("ciphertext", encrypted).putString("iv", iv).commit());

        ConnectionStore store = new ConnectionStore(context);
        assertEquals(ConnectionSpec.digest(iv + encrypted), store.binding());
        ConnectionSpec loaded = store.load();
        assertNotNull(loaded);
        assertEquals("https://legacy.example.com", loaded.url);
        assertEquals("legacy-secret", loaded.secret);

        List<ConnectionStore.ProfileSummary> summaries = store.listProfiles();
        assertEquals(1, summaries.size());
        assertEquals("https://legacy.example.com", summaries.get(0).url);
        String migratedId = summaries.get(0).id;
        assertEquals(migratedId, store.activeProfileId());

        store.addProfile("Secondary", "https://second.example.com", "second-secret", false);
        assertEquals(2, store.listProfiles().size());
        assertEquals("legacy-secret", store.selectProfile(migratedId).secret);
    }
}
