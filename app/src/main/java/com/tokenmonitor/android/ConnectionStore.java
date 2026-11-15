package com.tokenmonitor.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ConnectionStore {
    static final class ProfileSummary {
        final String id;
        final String name;
        final String url;
        final boolean allowHttp;

        ProfileSummary(String id, String name, String url, boolean allowHttp) {
            this.id = id;
            this.name = name;
            this.url = url;
            this.allowHttp = allowHttp;
        }
    }

    private static final class StoredProfile {
        String id;
        String name;
        String url;
        boolean allowHttp;
        String secret;

        StoredProfile(String id, String name, String url, boolean allowHttp, String secret) {
            this.id = id;
            this.name = name;
            this.url = url;
            this.allowHttp = allowHttp;
            this.secret = secret;
        }

        ProfileSummary summary() {
            return new ProfileSummary(id, name, url, allowHttp);
        }
    }

    private static final class StoreState {
        String activeId;
        final List<StoredProfile> profiles;

        StoreState(String activeId, List<StoredProfile> profiles) {
            this.activeId = activeId;
            this.profiles = profiles;
        }
    }

    private static final String ALIAS = "token-monitor-hub-v1";
    private static final String PREF_CIPHERTEXT = "ciphertext";
    private static final String PREF_IV = "iv";
    private static final String PREF_BINDING = "binding";
    private static final int VERSION = 2;
    private static final int MAX_NAME_LENGTH = 64;
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

    private static String defaultProfileName(String url) {
        Uri parsed = Uri.parse(url);
        String host = parsed == null ? null : parsed.getHost();
        if (host == null || host.isEmpty()) return "Hub";
        int port = parsed.getPort();
        String label = port > 0 ? host + ":" + port : host;
        return label.length() > MAX_NAME_LENGTH ? label.substring(0, MAX_NAME_LENGTH) : label;
    }

    private static String cleanName(String raw, String fallbackUrl) {
        String trimmed = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (trimmed.isEmpty()) return defaultProfileName(fallbackUrl);
        return trimmed.length() > MAX_NAME_LENGTH ? trimmed.substring(0, MAX_NAME_LENGTH) : trimmed;
    }

    private static StoredProfile findById(StoreState state, String id) {
        if (id == null || id.isEmpty()) return null;
        for (StoredProfile profile : state.profiles) {
            if (id.equals(profile.id)) return profile;
        }
        return null;
    }

    private static StoredProfile findMatchingDestination(StoreState state, String url, boolean allowHttp) {
        for (StoredProfile profile : state.profiles) {
            if (url.equals(profile.url) && allowHttp == profile.allowHttp) return profile;
        }
        return null;
    }

    private StoreState readState() throws Exception {
        String encrypted = preferences.getString(PREF_CIPHERTEXT, null);
        if (encrypted == null || encrypted.isEmpty()) return new StoreState("", new ArrayList<>());
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(preferences.getString(PREF_IV, ""), Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        JSONObject data = new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8));
        if (data.has("profiles")) {
            JSONArray array = data.optJSONArray("profiles");
            List<StoredProfile> profiles = new ArrayList<>();
            if (array != null) {
                for (int index = 0; index < array.length(); index++) {
                    JSONObject item = array.optJSONObject(index);
                    if (item == null) continue;
                    String id = item.optString("id", "").trim();
                    String url = item.optString("url", "");
                    String secret = item.optString("secret", "");
                    boolean allowHttp = item.optBoolean("allowHttp");
                    if (id.isEmpty() || url.isEmpty() || secret.isEmpty()) continue;
                    ConnectionSpec spec = new ConnectionSpec(url, secret, allowHttp);
                    profiles.add(new StoredProfile(id, cleanName(item.optString("name", ""), spec.url),
                            spec.url, spec.allowHttp, spec.secret));
                }
            }
            String activeId = data.optString("activeId", "");
            if (findById(new StoreState(activeId, profiles), activeId) == null) activeId = "";
            return new StoreState(activeId, profiles);
        }
        ConnectionSpec legacy = new ConnectionSpec(data.getString("url"), data.getString("secret"), data.optBoolean("allowHttp"));
        String legacyId = "hub-" + ConnectionSpec.digest(legacy.url + "\n" + legacy.allowHttp).substring(0, 12);
        List<StoredProfile> profiles = new ArrayList<>();
        profiles.add(new StoredProfile(legacyId, defaultProfileName(legacy.url), legacy.url, legacy.allowHttp, legacy.secret));
        return new StoreState(legacyId, profiles);
    }

    private void writeState(StoreState state, boolean refreshBinding, boolean clearWidgets) throws Exception {
        if (state.profiles.isEmpty()) {
            if (!preferences.edit().clear().commit()) throw new IllegalStateException("Cannot clear connection");
            if (clearWidgets) UsageWidgetStore.clear(context);
            return;
        }
        JSONArray array = new JSONArray();
        for (StoredProfile profile : state.profiles) {
            array.put(new JSONObject()
                    .put("id", profile.id)
                    .put("name", profile.name)
                    .put("url", profile.url)
                    .put("allowHttp", profile.allowHttp)
                    .put("secret", profile.secret));
        }
        JSONObject data = new JSONObject()
                .put("version", VERSION)
                .put("activeId", state.activeId)
                .put("profiles", array);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        String encrypted = Base64.encodeToString(cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        SharedPreferences.Editor editor = preferences.edit()
                .putString(PREF_CIPHERTEXT, encrypted)
                .putString(PREF_IV, iv);
        if (state.activeId.isEmpty()) {
            editor.putString(PREF_BINDING, "");
        } else if (refreshBinding || !preferences.contains(PREF_BINDING) || preferences.getString(PREF_BINDING, "").isEmpty()) {
            editor.putString(PREF_BINDING, ConnectionSpec.digest(iv + encrypted));
        }
        if (!editor.commit()) throw new IllegalStateException("Cannot save connection");
        if (clearWidgets) UsageWidgetStore.clear(context);
    }

    void save(ConnectionSpec spec) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            StoredProfile active = findById(state, state.activeId);
            StoredProfile target = (active != null && spec.url.equals(active.url) && spec.allowHttp == active.allowHttp)
                    ? active : findMatchingDestination(state, spec.url, spec.allowHttp);
            if (target == null) {
                String id = "hub-" + UUID.randomUUID();
                target = new StoredProfile(id, defaultProfileName(spec.url), spec.url, spec.allowHttp, spec.secret);
                state.profiles.add(target);
            } else {
                target.name = cleanName(target.name, spec.url);
                target.url = spec.url;
                target.allowHttp = spec.allowHttp;
                target.secret = spec.secret;
            }
            state.activeId = target.id;
            writeState(state, true, true);
        }
    }

    ConnectionSpec addProfile(String name, String address, String secret, boolean allowHttp) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            ConnectionSpec spec = new ConnectionSpec(address, secret, allowHttp);
            StoreState state = readState();
            String id = "hub-" + UUID.randomUUID();
            state.profiles.add(new StoredProfile(id, cleanName(name, spec.url), spec.url, spec.allowHttp, spec.secret));
            state.activeId = id;
            writeState(state, true, true);
            return spec;
        }
    }

    ConnectionSpec saveProfile(String id, String name, String address, String secret, boolean allowHttp) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            StoredProfile existing = findById(state, id);
            if (existing == null) throw new IllegalArgumentException("未找到指定的 Hub 连接");
            ConnectionSpec probe = new ConnectionSpec(address, "probe", allowHttp);
            boolean sameDestination = probe.url.equals(existing.url) && probe.allowHttp == existing.allowHttp;
            String candidateSecret = secret == null || secret.trim().isEmpty() ? null : secret;
            if (candidateSecret == null && !sameDestination) {
                throw new IllegalArgumentException("更改 Hub 地址或协议后请重新输入密钥");
            }
            ConnectionSpec spec = new ConnectionSpec(address, candidateSecret != null ? candidateSecret : existing.secret, allowHttp);
            existing.name = cleanName(name, spec.url);
            existing.url = spec.url;
            existing.allowHttp = spec.allowHttp;
            existing.secret = spec.secret;
            state.activeId = existing.id;
            writeState(state, true, true);
            return spec;
        }
    }

    ConnectionSpec selectProfile(String id) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            StoredProfile existing = findById(state, id);
            if (existing == null) throw new IllegalArgumentException("未找到指定的 Hub 连接");
            state.activeId = existing.id;
            writeState(state, true, true);
            return new ConnectionSpec(existing.url, existing.secret, existing.allowHttp);
        }
    }

    boolean deleteProfile(String id) throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            StoredProfile target = findById(state, id);
            if (target == null) return false;
            boolean wasActive = target.id.equals(state.activeId);
            state.profiles.remove(target);
            if (wasActive) state.activeId = "";
            writeState(state, wasActive, wasActive);
            return wasActive;
        }
    }

    void disconnectActive() throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            try {
                StoreState state = readState();
                if (state.profiles.isEmpty()) {
                    clear();
                    return;
                }
                state.activeId = "";
                writeState(state, true, true);
            } catch (GeneralSecurityException error) {
                clear();
            }
        }
    }

    List<ProfileSummary> listProfiles() throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            List<ProfileSummary> summaries = new ArrayList<>(state.profiles.size());
            for (StoredProfile profile : state.profiles) summaries.add(profile.summary());
            return Collections.unmodifiableList(summaries);
        }
    }

    String activeProfileId() throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            return readState().activeId;
        }
    }

    // Each encrypted active-profile save creates a new binding, even when reconnecting to the same Hub.
    String binding() {
        String encrypted = preferences.getString(PREF_CIPHERTEXT, "");
        if (encrypted.isEmpty()) return "";
        if (preferences.contains(PREF_BINDING)) return preferences.getString(PREF_BINDING, "");
        return ConnectionSpec.digest(preferences.getString(PREF_IV, "") + encrypted);
    }

    ConnectionSpec load() throws Exception {
        synchronized (UsageWidgetStore.LOCK) {
            StoreState state = readState();
            StoredProfile active = findById(state, state.activeId);
            if (active == null) return null;
            return new ConnectionSpec(active.url, active.secret, active.allowHttp);
        }
    }

    void clear() {
        synchronized (UsageWidgetStore.LOCK) {
            if (!preferences.edit().clear().commit()) throw new IllegalStateException("Cannot clear connection");
            UsageWidgetStore.clear(context);
        }
    }
}
