/**
 * Maps between the app-level `Playlist` shape (what `window.electron.db*`
 * callers pass/expect) and the flat `playlists` SQLite row. Ported from the
 * desktop implementation in
 * `apps/electron-backend/src/app/database/operations/playlist.operations.ts`
 * so the on-disk row shape matches the desktop database.
 */

const PLAYLIST_TYPES = {
    XTREAM: 'xtream',
    STALKER: 'stalker',
    M3U_FILE: 'm3u-file',
    M3U_TEXT: 'm3u-text',
    M3U_URL: 'm3u-url',
} as const;

type PlaylistType = (typeof PLAYLIST_TYPES)[keyof typeof PLAYLIST_TYPES];
const PLAYLIST_TYPE_VALUES = new Set<PlaylistType>(
    Object.values(PLAYLIST_TYPES)
);

export interface PlaylistRow {
    id: string;
    name: string;
    serverUrl: string | null;
    username: string | null;
    password: string | null;
    last_updated: string | null;
    type: PlaylistType;
    userAgent: string | null;
    origin: string | null;
    referrer: string | null;
    filePath: string | null;
    epg_urls: string | null;
    detected_epg_urls: string | null;
    manual_epg_urls: string | null;
    disabled_epg_urls: string | null;
    autoRefresh: number;
    macAddress: string | null;
    url: string | null;
    portal_url: string | null;
    count: number | null;
    import_date: string | null;
    update_date: number | null;
    position: number | null;
    favorites: string | null;
    recently_viewed: string | null;
    payload: string | null;
    last_usage: string | null;
}

function getStringValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function getNumericValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        console.warn('[android-bridge] failed to parse JSON column:', error);
        return fallback;
    }
}

function getStringArrayValue(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0);
}

function inferPlaylistType(playlist: Record<string, unknown>): PlaylistType {
    const explicitType = getStringValue(playlist.type);
    if (
        explicitType &&
        PLAYLIST_TYPE_VALUES.has(explicitType as PlaylistType)
    ) {
        return explicitType as PlaylistType;
    }
    if (getStringValue(playlist.serverUrl)) {
        return PLAYLIST_TYPES.XTREAM;
    }
    if (getStringValue(playlist.macAddress)) {
        return PLAYLIST_TYPES.STALKER;
    }
    if (getStringValue(playlist.filePath)) {
        return PLAYLIST_TYPES.M3U_FILE;
    }
    if (getStringValue(playlist.url)) {
        return PLAYLIST_TYPES.M3U_URL;
    }
    return PLAYLIST_TYPES.M3U_TEXT;
}

export function buildPlaylistRow(
    playlist: Record<string, unknown>
): PlaylistRow | null {
    const id = getStringValue(playlist._id) ?? getStringValue(playlist.id);
    if (!id) {
        return null;
    }

    const type = inferPlaylistType(playlist);
    const portalUrl = getStringValue(playlist.portalUrl);
    const url = getStringValue(playlist.url);
    const nowIso = new Date().toISOString();
    const updateDate = getNumericValue(playlist.updateDate);

    return {
        id,
        name:
            getStringValue(playlist.title) ??
            getStringValue(playlist.name) ??
            id,
        serverUrl: getStringValue(playlist.serverUrl) ?? null,
        username: getStringValue(playlist.username) ?? null,
        password: getStringValue(playlist.password) ?? null,
        last_updated:
            (typeof updateDate === 'number'
                ? new Date(updateDate).toISOString()
                : getStringValue(playlist.lastUpdated)) ?? null,
        type,
        userAgent: getStringValue(playlist.userAgent) ?? null,
        origin: getStringValue(playlist.origin) ?? null,
        referrer: getStringValue(playlist.referrer) ?? null,
        filePath: getStringValue(playlist.filePath) ?? null,
        epg_urls:
            playlist.epgUrls !== undefined
                ? JSON.stringify(getStringArrayValue(playlist.epgUrls))
                : null,
        detected_epg_urls:
            playlist.detectedEpgUrls !== undefined
                ? JSON.stringify(getStringArrayValue(playlist.detectedEpgUrls))
                : null,
        manual_epg_urls:
            playlist.manualEpgUrls !== undefined
                ? JSON.stringify(getStringArrayValue(playlist.manualEpgUrls))
                : null,
        disabled_epg_urls:
            playlist.disabledEpgUrls !== undefined
                ? JSON.stringify(
                      getStringArrayValue(playlist.disabledEpgUrls)
                  )
                : null,
        autoRefresh: playlist.autoRefresh ? 1 : 0,
        macAddress: getStringValue(playlist.macAddress) ?? null,
        url: (type === PLAYLIST_TYPES.STALKER ? (portalUrl ?? url) : url) ?? null,
        portal_url: portalUrl ?? null,
        count: getNumericValue(playlist.count) ?? null,
        import_date: getStringValue(playlist.importDate) ?? null,
        update_date: updateDate ?? null,
        position: getNumericValue(playlist.position) ?? null,
        favorites:
            playlist.favorites !== undefined
                ? JSON.stringify(playlist.favorites)
                : null,
        recently_viewed:
            playlist.recentlyViewed !== undefined
                ? JSON.stringify(playlist.recentlyViewed)
                : null,
        payload: JSON.stringify(playlist),
        last_usage: getStringValue(playlist.lastUsage) ?? nowIso,
    };
}

export function parseAppPlaylist(row: PlaylistRow): Record<string, unknown> {
    const payload = parseJsonValue<Record<string, unknown> | null>(
        row.payload,
        null
    );
    const base = payload && typeof payload === 'object' ? payload : {};
    const favorites = parseJsonValue<unknown[]>(row.favorites, []);
    const recentlyViewed = parseJsonValue<unknown[]>(row.recently_viewed, []);
    const epgUrls = getStringArrayValue(
        row.epg_urls
            ? parseJsonValue<unknown[]>(row.epg_urls, [])
            : base.epgUrls
    );
    const detectedEpgUrls = getStringArrayValue(
        row.detected_epg_urls
            ? parseJsonValue<unknown[]>(row.detected_epg_urls, [])
            : (base.detectedEpgUrls ?? epgUrls)
    );
    const manualEpgUrls = getStringArrayValue(
        row.manual_epg_urls
            ? parseJsonValue<unknown[]>(row.manual_epg_urls, [])
            : base.manualEpgUrls
    );
    const disabledEpgUrls = getStringArrayValue(
        row.disabled_epg_urls
            ? parseJsonValue<unknown[]>(row.disabled_epg_urls, [])
            : base.disabledEpgUrls
    );
    const importDate = row.import_date ?? new Date().toISOString();
    const portalUrl =
        row.portal_url ??
        (row.type === PLAYLIST_TYPES.STALKER ? row.url : null);
    const updateDate =
        row.update_date ??
        (row.last_updated ? new Date(row.last_updated).getTime() : undefined);

    return {
        ...base,
        _id: row.id,
        title:
            getStringValue(base.title) ?? getStringValue(base.name) ?? row.name,
        count: row.count ?? getNumericValue(base.count) ?? 0,
        importDate: getStringValue(base.importDate) ?? importDate,
        lastUsage:
            row.last_usage ??
            getStringValue(base.lastUsage) ??
            getStringValue(base.importDate) ??
            importDate,
        favorites,
        recentlyViewed,
        autoRefresh: Boolean(row.autoRefresh) || Boolean(base.autoRefresh),
        url:
            row.type === PLAYLIST_TYPES.M3U_URL
                ? (row.url ?? getStringValue(base.url))
                : getStringValue(base.url),
        filePath: row.filePath ?? getStringValue(base.filePath),
        epgUrls,
        detectedEpgUrls,
        manualEpgUrls,
        disabledEpgUrls,
        userAgent: row.userAgent ?? getStringValue(base.userAgent),
        referrer: row.referrer ?? getStringValue(base.referrer),
        origin: row.origin ?? getStringValue(base.origin),
        updateDate,
        position: row.position ?? getNumericValue(base.position),
        serverUrl: row.serverUrl ?? getStringValue(base.serverUrl),
        username: row.username ?? getStringValue(base.username),
        password: row.password ?? getStringValue(base.password),
        macAddress: row.macAddress ?? getStringValue(base.macAddress),
        portalUrl: portalUrl ?? getStringValue(base.portalUrl),
    };
}
