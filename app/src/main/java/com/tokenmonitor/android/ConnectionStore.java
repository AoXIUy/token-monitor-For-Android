package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ConnectionStore {
    private static final String ALIAS = "token-monitor-hub-v1";
    private final SharedPreferences preferences;
    private final Context context;

    ConnectionStore(Context context) {
        this.context = context.getApplicationContext();
        preferences = context.getSharedPreferences("hub-connection", Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    void save(ConnectionSpec spec) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            JSONObject data = new JSONObject().put("url", spec.url).put("secret", spec.secret)
                    .put("allowHttp", spec.allowHttp);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
            if (!preferences.edit().putString("ciphertext", encrypted).putString("iv", iv).commit()) {
                throw new IllegalStateException("Cannot save connection");
            }
            UsageWidgetStore.clear(context);
        }
    }

    // Each encrypted save creates a new binding, even when reconnecting to the same Hub.
    String binding() {
        String encrypted = preferences.getString("ciphertext", "");
        return encrypted.isEmpty() ? "" : ConnectionSpec.digest(preferences.getString("iv", "") + encrypted);
    }

    ConnectionSpec load() throws Exception {
        String encrypted = preferences.getString("ciphertext", null);
        if (encrypted == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        JSONObject data = new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8));
        return new ConnectionSpec(data.getString("url"), data.getString("secret"), data.optBoolean("allowHttp"));
    }

    void clear() {
        synchronized (UsageWidgetStore.LOCK) {
            if (!preferences.edit().clear().commit()) throw new IllegalStateException("Cannot clear connection");
            UsageWidgetStore.clear(context);
        }
    }
}
