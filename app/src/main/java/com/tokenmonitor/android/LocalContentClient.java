package com.tokenmonitor.android;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Only the packaged dashboard may share a WebView with the native bridge. */
final class LocalContentClient extends WebViewClient {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String START_URL = ORIGIN + "/assets/index.html";
    private static final Set<String> PATHS = new HashSet<>(Arrays.asList(
            "/assets/index.html", "/assets/app.css", "/assets/app.js", "/assets/model.js",
            "/assets/shared/compactTokens.js", "/assets/shared/limits/balanceDisplay.js",
            "/assets/shared/sessionActivityProviders.js", "/assets/shared/sessionLive.js",
            "/assets/shared/sessionGroups.js"));
    private final WebViewAssetLoader loader;

    LocalContentClient(Context context) {
        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // The Activity loads START_URL itself. Links, redirects and JS navigation
        // never need to leave or replace that document.
        return true;
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("GET".equals(request.getMethod()) && "https".equals(uri.getScheme())
                && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPort() == -1
                && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null
                && PATHS.contains(uri.getEncodedPath())) {
            WebResourceResponse response = loader.shouldInterceptRequest(uri);
            if (response != null) return response;
        }
        // Never return null for an unknown URL: WebView would otherwise attempt
        // a real network load. This applies to main documents and subresources.
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
                java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
}
