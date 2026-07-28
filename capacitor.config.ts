import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jasonr.iptvnator',
  appName: 'IPTVnatorAndroid',
  webDir: 'dist/apps/web',
  plugins: {
    CapacitorHttp: {
      // Global fetch()/XMLHttpRequest interception, not the plugin itself.
      // `fetchPlaylistByUrl` still calls `CapacitorHttp.get()` directly for
      // CORS-free M3U imports regardless of this flag. Enabling it globally
      // broke live HLS playback: Video.js's XHR-based HLS tech resolves a
      // manifest's relative segment URIs against the response's final URL,
      // but the interceptor reports redirected responses as coming from
      // `https://localhost/_capacitor_http_interceptor_?u=...` instead of
      // the real (often different-host) CDN URL an Xtream panel 302s to,
      // producing broken segment URLs and an infinite "problem encountered
      // with playlist" retry loop.
      enabled: false,
    },
  },
};

export default config;
