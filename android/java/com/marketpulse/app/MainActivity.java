package com.marketpulse.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * MarketPulse for Android.
 *
 * The whole app is bundled in assets/ and served from a virtual https origin
 * (https://marketpulse.local). That matters: a real secure origin means
 * localStorage persists, the service-worker check passes, fetch() behaves with
 * normal CORS semantics, and the app is fully functional with no network.
 * Market data still comes from the live internet exactly as on the web.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://marketpulse.local";
    private static final String START_URL = ORIGIN + "/index.html";

    private WebView web;
    private long lastBackPress = 0L;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#05070B")));
        window.setStatusBarColor(Color.parseColor("#05070B"));
        window.setNavigationBarColor(Color.parseColor("#000000"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#05070B"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#05070B"));
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.parseColor("#05070B"));

        // Serve the bundled app from a virtual https origin.
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null && ORIGIN.equals(url.getScheme() + "://" + url.getAuthority())) {
                    WebResourceResponse res = serve(url.getPath());
                    if (res != null) return res;
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null && ORIGIN.equals(url.getScheme() + "://" + url.getAuthority())) {
                    return false; // in-app
                }
                if (url != null && (url.getScheme().equals("http") || url.getScheme().equals("https"))) {
                    // Article links and the like open in the real browser.
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (Exception ignored) {
                    }
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.setVisibility(View.VISIBLE);
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidHost");

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    /** Maps a request path onto a file in assets/, with SPA fallback. */
    private WebResourceResponse serve(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        String clean;
        try {
            clean = URLDecoder.decode(path, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            clean = path;
        }
        if (clean.contains("..")) return null;

        String asset = clean.startsWith("/") ? clean.substring(1) : clean;
        String mime = mimeOf(asset);

        try {
            InputStream in = getAssets().open(asset);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            WebResourceResponse res = new WebResourceResponse(mime, "UTF-8", in);
            res.setResponseHeaders(headers);
            return res;
        } catch (IOException notFound) {
            // Unknown path -> let the SPA handle it.
            if (clean.contains(".")) return null;
            try {
                InputStream in = getAssets().open("index.html");
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return null;
            }
        }
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json") || n.endsWith(".webmanifest")) return "application/json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** JS -> Java bridge: hardware back, and a way to open settings. */
    private class Bridge {
        @JavascriptInterface
        public boolean handleBack() {
            runOnUiThread(() -> {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    finish();
                }
            });
            return true;
        }

        @JavascriptInterface
        public void setStatusBarStyle(final boolean light) {
            runOnUiThread(() -> {
                Window w = getWindow();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    int flags = w.getDecorView().getSystemUiVisibility();
                    if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    w.getDecorView().setSystemUiVisibility(flags);
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        // Let the app close a detail view or return to the Markets tab first.
        web.evaluateJavascript(
                "(function(){try{return window.__mpBack?String(window.__mpBack()):'no'}catch(e){return 'no'}})()",
                value -> {
                    String v = value == null ? "" : value.replace("\"", "").trim();
                    if (v.equals("true")) return;
                    long now = System.currentTimeMillis();
                    if (now - lastBackPress < 2000) {
                        finish();
                    } else {
                        lastBackPress = now;
                        android.widget.Toast.makeText(MainActivity.this,
                                "Press back again to exit", android.widget.Toast.LENGTH_SHORT).show();
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
