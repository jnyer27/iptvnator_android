# Android port: Capacitor bridge design

## Strategy

`RuntimeCapabilitiesService` (libs/services) already treats "Electron-capable" as
"a `window.electron` object exists with these method names" — it does not hardcode
a two-way `electron | pwa` switch anywhere except a handful of OS-chrome getters
(`isMacOS`/`isWindows`/`isLinux`/`usesCustomWindowControls`). That means the Angular
app itself needs no fork: we ship the existing `apps/web` build inside a Capacitor
WebView and provide a `window.electron`-shaped object backed by Capacitor plugins
and Android-native code instead of Electron IPC. `isElectron` reports `true`,
`platform` reports `'android'`, and every `supports*` getter in
`RuntimeCapabilitiesService` naturally reports the right thing because it already
does per-method feature detection (`hasElectronMethod('x')`) rather than a platform
enum check.

Consequence: OS-chrome getters (`isMacOS`/`isWindows`/`isLinux`) are already `false`
for any non-darwin/win32/linux platform string, so `usesCustomWindowControls` is
already `false` for `platform: 'android'` with zero changes needed there.

New package: `apps/android-bridge` (TypeScript, runs inside the Capacitor WebView,
built as part of the `web` app or injected as a separate initialization script)
implements `ElectronBridgeApi` incrementally, method group by method group, per the
phase tiers below. Unimplemented methods are simply absent from the object —
`hasElectronMethod` returns `false` for them and the corresponding UI affordance
hides itself, exactly as it does today when a desktop build predates a given
Electron IPC method.

## Chosen building blocks

| Concern | Choice | Why |
|---|---|---|
| SQLite | `@capacitor-community/sqlite` | Real native SQLite (not sql.js/WASM) accessible from TS via `execute`/`query`/`run`; supports FTS5 on Android; lets us port `libs/shared/database/src/lib/schema.ts`'s `CREATE TABLE` statements almost verbatim and reimplement the query/service logic in TypeScript — no Kotlin needed for the data layer. |
| Network (Xtream/Stalker proxy, EPG/playlist fetch) | `@capacitor/http` | Native HTTP stack from the WebView's JS, bypasses the CORS restrictions the Electron main process was working around; supports custom headers (VLC/MAG250 UA spoofing) same as the `axios` calls it replaces. |
| Local file import/export | `@capawesome/capacitor-file-picker` + `@capacitor/filesystem` | SAF-backed picker/writer, replacement for `dialog.showOpenDialog`/`showSaveDialog` + `fs.readFile`/`writeFile`. |
| Key/value settings | `appState` SQLite table (reuse existing schema) | Matches `dbGetAppState`/`dbSetAppState` exactly; avoids a second storage mechanism. |
| EPG XML parsing | `saxes` (already a repo dependency, pure JS) + `pako` (gzip) inside a Web Worker | Same streaming-SAX approach as `epg-parser.worker.ts`, ported to a browser Web Worker instead of a Node `worker_threads.Worker`. |
| Video playback (MVP) | Existing `video.js` + `mpegts.js` in the WebView | Already how the `web`/PWA build plays HLS/TS today; Chromium WebView on Android supports MSE, so this should work with no native code for a first playable build. |
| Video playback (phase 2) | Custom Kotlin Capacitor plugin wrapping `androidx.media3` (ExoPlayer) | Hardware-accelerated decode, broader container/DRM support, better battery/perf than a WebView `<video>` for long-running live TV playback. |
| Downloads | Android system `DownloadManager` service, wrapped in a small Kotlin plugin | Handles background survival, HTTP Range resume, and notifications natively — replaces the ~10-file hand-rolled queue/resume/crash-recovery logic in `apps/electron-backend/src/app/events/database/download-*.ts` with an OS primitive instead of reimplementing it. |
| External player handoff | `Intent.ACTION_VIEW` (small Kotlin plugin) | Replacement for spawning MPV/VLC as child processes; no persistent socket-based remote control of the external app is possible on Android, so "reuse instance" mode is dropped. |

## Method-group mapping and phasing

**Phase 1 — bootable shell** (playlist import + browse + play, no portals yet):
- Playlist management: `fetchPlaylistByUrl`, `openPlaylistFromFile`, `updatePlaylistFromFilePath`, `getPathForFile` → file-picker/@capacitor/http, pure TS.
- SQLite playlists/app-state: `dbCreatePlaylist`, `dbGetPlaylist(s)`, `dbUpsertAppPlaylist(s)`, `dbGetAppPlaylist(s)`, `dbUpdatePlaylist`, `dbDeletePlaylist`, `dbDeleteAllPlaylists`, `dbGetAppState`, `dbSetAppState`.
- Settings: `updateSettings` (subset relevant to mobile: player prefs, EPG prefs — drop MPV/VLC path fields).
- Playback: existing video.js/mpegts.js, no bridge methods required.
- `getAppVersion`, `platform` (return `'android'`).

**Phase 2 — portals + EPG + favorites** (the bulk of daily-use feature parity):
- Xtream: `xtreamRequest`, `xtreamCancelSession`, `xtreamProbeUrl` via `@capacitor/http`.
- Stalker: `stalkerRequest` via `@capacitor/http`, porting the MAC-cookie/MAG250-UA/`cmd`-encoding logic from `stalker.events.ts` into TS.
- Categories/content cache: `dbHasCategories`, `dbGetCategories`, `dbSaveCategories`, `dbGetAllCategories`, `dbUpdateCategoryVisibility`, `dbHasContent`, `dbGetContent`, `dbSaveContent`, `dbClearXtreamImportCache`, `dbSearchContent`, `dbGetContentByXtreamId`, `dbSetContentBackdropIfMissing`, `onDbSaveContentProgress`/`removeDbSaveContentProgress`.
- Favorites/recent/global search: full `db*Favorite*`, `db*Recent*`, `dbGlobalSearch`, `dbGetGlobalRecentlyAdded`, `dbMatchTitles`.
- Playback position (resume): full `db*PlaybackPosition*` group + `onPlaybackPositionUpdate`.
- EPG: full group (`fetchEpg`, `getChannelPrograms`, `getCurrentProgramsBatch`, `getEpgChannelMetadata`, `getEpgChannels(ByRange)`, `forceFetchEpg`, `clearEpgData(ForSource)`, `checkEpgFreshness`, `searchEpgPrograms`, `onEpgProgress`) + EPG mapping group, via the Web Worker SAX pipeline above.
- TMDB cache: full group — trivial once SQLite layer exists.
- Playlist refresh/auto-update: `refreshPlaylist`, `cancelPlaylistRefresh`, `autoUpdatePlaylists`, `onPlaylistRefreshEvent`.

**Phase 3 — native player + downloads:**
- ExoPlayer Kotlin plugin swaps in behind the existing player UI/controls contract (see `docs/architecture/player-controls-contract.md`) as an opt-in or default depending on measured WebView playback quality from Phase 1/2 testing.
- Downloads: full `downloads*` group, backed by Android `DownloadManager`.
- External player: `openInMpv`/`openInVlc` reimagined as a single `openInExternalPlayer` intent-based method (installed-app chooser); `closeExternalPlayerSession`/`onExternalPlayerSessionUpdate` drop the "reuse instance" semantics since Android can't hold a control channel open to another app — sessions become fire-and-forget with no return status beyond "intent launched."

**Dropped — no Android equivalent, not reimplemented:**
- Window management: `minimizeWindow`, `toggleMaximizeWindow`, `closeWindow`, `getWindowState`, `onWindowStateChange`.
- App auto-update via electron-updater: `checkForAppUpdate`, `downloadAppUpdate`, `installAppUpdate`, `getAppUpdateReleaseNotes`, `onAppUpdateStatusChange` — Play Store owns updates. `getAppUpdateStatus` can still return the existing `Unsupported` status value the interface already defines, so calling UI code degrades gracefully without a bridge-shape change.
- Squirrel installer events — Windows-only, N/A.
- Remote-control-over-LAN: `getLocalIpAddresses`, `updateRemoteControlStatus`, `onChannelChange`, `onRemoteControlCommand` — no paired "desktop window" to remote-control; revisit only if there's ever demand for controlling the Android app from another device.
- Embedded MPV (`EmbeddedMpv*`, `getEmbeddedMpvSupport`, `prepareEmbeddedMpv`, etc.) — entirely superseded by the Phase 3 ExoPlayer plugin, which is Android's version of "the player embedded in the app window," not a port of this subsystem.
- `saveFileDialog`/`writeFile`/`setUserAgent` in their current Electron-dialog form — folded into the Phase 1 file-picker work instead of ported 1:1.

## Data layer notes

- One SQLite database file (matches desktop: single `iptvnator.db`, not per-playlist), opened once at app start via `@capacitor-community/sqlite`.
- Port `createTables()` from `libs/shared/database/src/lib/connection.ts` as literal SQL run on first launch. Skip the desktop migration chain (`ALTER TABLE ... duplicate column` try/catch, FTS5 rebuild, dedup passes) since Android ships a fresh DB with the current schema from day one — no legacy rows to migrate.
- FTS5 virtual tables/triggers for content and EPG title search port as-is; confirm `@capacitor-community/sqlite`'s bundled SQLite build includes FTS5 on Android before relying on it (fallback: `LIKE`-based search, same fallback the desktop EPG search already has for Cyrillic/Unicode).

## Open implementation questions to resolve during Phase 1

1. Whether EPG parsing in a WebView Web Worker keeps up on low-end devices for very large XMLTV feeds (desktop uses a Node worker thread with no memory ceiling comparable to a WebView worker) — may need batch-size tuning.
2. Whether `@capacitor-community/sqlite`'s FTS5 support is confirmed on the installed Android SQLite build before Phase 2 EPG/content search work starts.
3. Exact Phase 3 decision criteria for when/whether to switch default playback from WebView video.js to the ExoPlayer plugin (e.g., specific stream types that fail in WebView MSE).
