package com.jasonr.iptvnator;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IptvPlayerPlugin.class);
        registerPlugin(XtreamHttpPlugin.class);
        super.onCreate(savedInstanceState);

        // The app page is served from https://localhost, but IPTV
        // panels/CDNs are virtually always plain http://. Without this, the
        // WebView blocks those as mixed content regardless of
        // usesCleartextTraffic (seen blocking poster images and, more
        // importantly, would also block HLS manifest/segment loads once
        // CapacitorHttp's global fetch/XHR interception is disabled).
        this.bridge.getWebView().getSettings()
            .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
