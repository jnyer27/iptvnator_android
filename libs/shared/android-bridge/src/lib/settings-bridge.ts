/**
 * `setUserAgent`/`updateSettings` stubs.
 *
 * Call sites treat these as always-present once `window.electron` exists
 * (e.g. `window.electron?.setUserAgent(...)` guards only the object, not the
 * method — a missing method throws synchronously rather than being caught by
 * the trailing `.catch()`, which silently aborts the calling function). Both
 * are safe no-ops here:
 *
 * - `setUserAgent` scopes a custom User-Agent/Referer to a session's network
 *   requests on desktop (Electron `session.webRequest`); the WebView has no
 *   equivalent JS-reachable hook, so per-stream UA/Referer overrides aren't
 *   supported yet on Android — most streams work without one.
 * - `updateSettings` mirrors settings to the Electron main process for
 *   desktop-only consumers (remote-control server, external MPV/VLC paths).
 *   `SettingsStore` (libs/services) already persists settings itself via
 *   IndexedDB independently of this call, so there's nothing to mirror here.
 */

export async function setUserAgent(): Promise<boolean> {
    return true;
}

export async function updateSettings(): Promise<void> {
    // No desktop-only consumer to mirror to.
}
