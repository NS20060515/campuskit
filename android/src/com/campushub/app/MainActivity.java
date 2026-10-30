package com.campushub.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * 校园通 Android 外壳。
 *
 * 设计要点：不做简单的 WebView 套壳，而是内置一个回环 HTTP 服务
 * （{@link AssetServer}），把打包进 assets 的网页通过 http://127.0.0.1:端口 发布。
 * 这样 WebView 处于「安全上下文」，localStorage、Service Worker、设备定位
 * 的行为与正式网站一致；回环服务不可用时自动退回 file:///android_asset。
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private static final int REQ_LOC = 1002;

    private WebView web;
    private FrameLayout root;
    private TextView splash;
    private ValueCallback<Uri[]> fileCallback;
    private AssetServer server;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window w = getWindow();
            w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            w.setStatusBarColor(Color.parseColor("#F5F6FB"));
            w.setNavigationBarColor(Color.parseColor("#FFFFFF"));
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F5F6FB"));

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#F5F6FB"));
        web.setVisibility(View.INVISIBLE);
        configure(web);

        splash = new TextView(this);
        splash.setText(R.string.app_name);
        splash.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        splash.setTextColor(Color.parseColor("#4F46E5"));
        splash.setGravity(Gravity.CENTER);
        splash.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(web);
        root.addView(splash);
        setContentView(root);

        String home;
        try {
            server = new AssetServer(getAssets(), "app");
            server.start();
            home = "http://127.0.0.1:" + server.getPort() + "/index.html";
        } catch (Throwable t) {
            server = null;
            home = "file:///android_asset/app/index.html";
        }
        web.loadUrl(home);
    }

    private void configure(WebView v) {
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(true);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // 在 UA 里加标记：网页据此识别「已在 APK 内运行」，不再提示安装到桌面
        s.setUserAgentString(s.getUserAgentString() + " CampusKitApp/1.0");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        v.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl() == null ? null : req.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (splash != null && splash.getVisibility() == View.VISIBLE) {
                    splash.setVisibility(View.GONE);
                    web.setVisibility(View.VISIBLE);
                }
            }
        });

        v.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback cb) {
                // 应用内已说明定位用途（按当前位置推荐最近教室）。
                // 注意：Android 6.0+ 的定位属于危险权限，必须先做运行时申请，
                // 否则即使这里放行，底层依然拿不到位置。
                pendingGeoOrigin = origin;
                pendingGeoCallback = cb;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                           != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    }, REQ_LOC);
                } else {
                    cb.invoke(origin, true, false);
                    pendingGeoCallback = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "选择照片"), REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    /** tel:/mailto: 交给系统；外部 http(s) 也用系统浏览器，应用内不开新窗口 */
    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("http://127.0.0.1") || url.startsWith("https://127.0.0.1")) {
            return false;
        }
        if (url.startsWith("file://")) {
            return false;
        }
        if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:")) {
            openExternal(url);
            return true;
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            openExternal(url);
            return true;
        }
        return false;
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            // 没有可处理的应用时忽略
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_LOC) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingGeoCallback != null) {
                pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
                pendingGeoCallback = null;
            }
            if (!granted) {
                // 用户拒绝：网页侧会自动退回「手动选择位置」，不影响其它功能
                web.evaluateJavascript(
                        "(function(){ if(window.CH && CH.ui) CH.ui.toast('未授予定位权限，已改为手动选择位置','err'); })()",
                        null);
            }
            return;
        }
        super.onRequestPermissionsResult(req, perms, results);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (res == RESULT_OK && data != null) {
                    if (data.getData() != null) {
                        result = new Uri[] { data.getData() };
                    } else if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int i = 0; i < n; i++) {
                            result[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.stop();
            server = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
