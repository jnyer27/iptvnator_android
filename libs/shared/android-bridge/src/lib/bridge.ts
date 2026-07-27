/**
 * Installs a `window.electron`-shaped object backed by Capacitor plugins
 * instead of Electron IPC. `RuntimeCapabilitiesService` (libs/services)
 * detects "Electron-capable" purely by checking for named methods on
 * `window.electron`, so the rest of the Angular app — `PlaylistsService`,
 * `DatabaseService`, `ElectronService` — works unmodified once this object
 * exists, exactly as it would against a desktop build that simply hasn't
 * shipped a given IPC method yet.
 *
 * Only implement methods here as Android-side support for them lands (see
 * `docs/architecture/android-capacitor-bridge.md` for the phased plan) —
 * omitted methods correctly report as unsupported via the same per-method
 * `hasElectronMethod` checks the desktop build relies on.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { ElectronBridgeApi } from '@iptvnator/shared/interfaces';
import * as playlistFetch from './playlist-fetch';
import * as playlistStore from './playlist-store';
import * as appStateStore from './app-state-store';
import * as xtreamFetch from './xtream-fetch';
import * as categoryStore from './category-store';
import * as contentStore from './content-store';
import * as nativePlayer from './native-player';
import * as settingsBridge from './settings-bridge';

type AndroidBridge = Partial<ElectronBridgeApi> & { platform: string };

function buildBridge(): AndroidBridge {
    return {
        platform: Capacitor.getPlatform(),

        getAppVersion: async () => (await App.getInfo()).version,

        // Playlist acquisition
        fetchPlaylistByUrl: playlistFetch.fetchPlaylistByUrl,
        openPlaylistFromFile: playlistFetch.openPlaylistFromFile,
        updatePlaylistFromFilePath: playlistFetch.updatePlaylistFromFilePath,
        getPathForFile: playlistFetch.getPathForFile,
        autoUpdatePlaylists: playlistFetch.autoUpdatePlaylists,

        // Playlist SQLite storage — this exact method set is what
        // `RuntimeCapabilitiesService.supportsSqlite` checks for.
        dbCreatePlaylist: playlistStore.dbCreatePlaylist,
        dbGetPlaylist: playlistStore.dbGetPlaylist,
        dbGetAppPlaylists: playlistStore.dbGetAppPlaylists,
        dbGetAppPlaylistMetas: playlistStore.dbGetAppPlaylistMetas,
        dbGetAppPlaylist: playlistStore.dbGetAppPlaylist,
        dbGetAppPlaylistFavoriteChannels:
            playlistStore.dbGetAppPlaylistFavoriteChannels,
        dbUpsertAppPlaylist: playlistStore.dbUpsertAppPlaylist,
        dbUpsertAppPlaylists: playlistStore.dbUpsertAppPlaylists,
        dbUpdatePlaylist: playlistStore.dbUpdatePlaylist,
        dbDeletePlaylist: playlistStore.dbDeletePlaylist,
        dbDeleteAllPlaylists: playlistStore.dbDeleteAllPlaylists,

        // App state key/value store
        dbGetAppState: appStateStore.dbGetAppState,
        dbSetAppState: appStateStore.dbSetAppState,

        // Xtream portal
        xtreamRequest: xtreamFetch.xtreamRequest,
        xtreamCancelSession: xtreamFetch.xtreamCancelSession,
        xtreamProbeUrl: xtreamFetch.xtreamProbeUrl,

        // Xtream category/content caching
        dbHasCategories: categoryStore.dbHasCategories,
        dbGetCategories: categoryStore.dbGetCategories,
        dbSaveCategories: categoryStore.dbSaveCategories,
        dbGetAllCategories: categoryStore.dbGetAllCategories,
        dbUpdateCategoryVisibility: categoryStore.dbUpdateCategoryVisibility,
        dbHasContent: contentStore.dbHasContent,
        dbGetContent: contentStore.dbGetContent,
        dbSaveContent: contentStore.dbSaveContent,
        dbGetContentByXtreamId: contentStore.dbGetContentByXtreamId,
        dbSearchContent: contentStore.dbSearchContent,
        dbClearXtreamImportCache: contentStore.dbClearXtreamImportCache,

        // Native fullscreen ExoPlayer Activity, standing in for the
        // desktop external MPV/VLC processes.
        openInMpv: nativePlayer.openInMpv,
        openInVlc: nativePlayer.openInVlc,
        closeExternalPlayerSession: nativePlayer.closeExternalPlayerSession,

        setUserAgent: settingsBridge.setUserAgent,
        updateSettings: settingsBridge.updateSettings,
    } as unknown as AndroidBridge;
}

/**
 * Installs the bridge on `window.electron` when running inside the native
 * Android shell. No-ops on web/PWA builds so this is safe to call
 * unconditionally from the app's bootstrap file.
 */
export function installAndroidBridge(): void {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    (window as unknown as { electron: ElectronBridgeApi }).electron =
        buildBridge() as ElectronBridgeApi;
}
