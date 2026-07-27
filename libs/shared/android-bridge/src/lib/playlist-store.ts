/**
 * Implements the `db*` playlist/app-state bridge methods against the local
 * SQLite database. This is the Android equivalent of
 * `apps/electron-backend/src/app/database/operations/playlist.operations.ts`
 * — same row shape, same upsert-by-id semantics, but running in-process
 * against `@capacitor-community/sqlite` instead of over Electron IPC to a
 * Drizzle/better-sqlite3 worker thread.
 *
 * Foreign keys are declared `ON DELETE CASCADE` in the schema and enabled via
 * `PRAGMA foreign_keys = ON` in `sqlite-connection.ts`, so deleting a
 * playlist row also removes its categories/content/favorites/etc. without
 * the desktop version's manual multi-table cleanup (that cleanup exists
 * there mainly for chunked progress-event reporting on very large tables).
 */

import { query, queryOne, run } from './sqlite-connection';
import { buildPlaylistRow, parseAppPlaylist, PlaylistRow } from './playlist-row.util';

const PLAYLIST_ROW_COLUMNS = [
    'id',
    'name',
    'serverUrl',
    'username',
    'password',
    'last_updated',
    'type',
    'userAgent',
    'origin',
    'referrer',
    'filePath',
    'epg_urls',
    'detected_epg_urls',
    'manual_epg_urls',
    'disabled_epg_urls',
    'autoRefresh',
    'macAddress',
    'url',
    'portal_url',
    'count',
    'import_date',
    'update_date',
    'position',
    'favorites',
    'recently_viewed',
    'payload',
    'last_usage',
] as const;

async function upsertRow(row: PlaylistRow): Promise<void> {
    const columns = PLAYLIST_ROW_COLUMNS;
    const placeholders = columns.map(() => '?').join(', ');
    const updateAssignments = columns
        .filter((column) => column !== 'id')
        .map((column) => `${column} = excluded.${column}`)
        .join(', ');

    await run(
        `INSERT INTO playlists (${columns.join(', ')})
         VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`,
        columns.map((column) => row[column])
    );
}

export async function dbCreatePlaylist(playlist: {
    id: string;
    name: string;
    serverUrl?: string;
    username?: string;
    password?: string;
    macAddress?: string;
    url?: string;
    type: string;
}): Promise<{ success: boolean }> {
    await run(
        `INSERT INTO playlists (id, name, serverUrl, username, password, macAddress, url, portal_url, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            playlist.id,
            playlist.name,
            playlist.serverUrl ?? null,
            playlist.username ?? null,
            playlist.password ?? null,
            playlist.macAddress ?? null,
            playlist.url ?? null,
            playlist.type === 'stalker' ? (playlist.url ?? null) : null,
            playlist.type,
        ]
    );
    return { success: true };
}

export async function dbGetPlaylist(
    playlistId: string
): Promise<Record<string, unknown> | null> {
    return queryOne(`SELECT * FROM playlists WHERE id = ?`, [playlistId]);
}

export async function dbUpsertAppPlaylist(
    playlist: Record<string, unknown>
): Promise<{ success: boolean }> {
    const row = buildPlaylistRow(playlist);
    if (!row) {
        throw new Error('Playlist ID is required for upsert');
    }
    await upsertRow(row);
    return { success: true };
}

export async function dbUpsertAppPlaylists(
    playlists: Record<string, unknown>[]
): Promise<{ success: boolean; count: number }> {
    if (!Array.isArray(playlists) || playlists.length === 0) {
        return { success: true, count: 0 };
    }

    const rows = playlists
        .map((playlist) => buildPlaylistRow(playlist))
        .filter((row): row is PlaylistRow => row !== null);

    for (const row of rows) {
        await upsertRow(row);
    }

    return { success: true, count: rows.length };
}

export async function dbGetAppPlaylists(): Promise<Record<string, unknown>[]> {
    const rows = await query<PlaylistRow>(`SELECT * FROM playlists`);
    return rows.map((row) => parseAppPlaylist(row));
}

export async function dbGetAppPlaylistMetas(): Promise<
    Record<string, unknown>[]
> {
    const columns = PLAYLIST_ROW_COLUMNS.filter((column) => column !== 'payload');
    const rows = await query<Omit<PlaylistRow, 'payload'>>(
        `SELECT ${columns.join(', ')} FROM playlists`
    );
    return rows.map((row) =>
        parseAppPlaylist({ ...row, payload: null } as PlaylistRow)
    );
}

export async function dbGetAppPlaylist(
    playlistId: string
): Promise<Record<string, unknown> | null> {
    const row = await queryOne<PlaylistRow>(
        `SELECT * FROM playlists WHERE id = ?`,
        [playlistId]
    );
    return row ? parseAppPlaylist(row) : null;
}

export async function dbGetAppPlaylistFavoriteChannels(
    playlistId: string
): Promise<{ favoriteId: string; favoriteIndex: number; channel: unknown }[]> {
    const row = await queryOne<Pick<PlaylistRow, 'favorites' | 'payload'>>(
        `SELECT favorites, payload FROM playlists WHERE id = ?`,
        [playlistId]
    );
    if (!row) {
        return [];
    }

    const favorites: string[] = row.favorites ? JSON.parse(row.favorites) : [];
    if (favorites.length === 0) {
        return [];
    }

    const payload = row.payload
        ? (JSON.parse(row.payload) as { playlist?: { items?: unknown[] } })
        : null;
    const channels = (payload?.playlist?.items ?? []) as {
        id?: string;
        url?: string;
    }[];

    const favoritePositions = new Map<string, number>();
    favorites.forEach((favorite, index) => {
        if (!favoritePositions.has(favorite)) {
            favoritePositions.set(favorite, index);
        }
    });

    const resolved: {
        favoriteId: string;
        favoriteIndex: number;
        channel: unknown;
    }[] = [];

    for (const channel of channels) {
        const key = favoritePositions.has(String(channel.id))
            ? String(channel.id)
            : favoritePositions.has(String(channel.url))
              ? String(channel.url)
              : null;
        if (key === null) {
            continue;
        }
        resolved.push({
            favoriteId: key,
            favoriteIndex: favoritePositions.get(key) as number,
            channel,
        });
    }

    return resolved.sort((a, b) => a.favoriteIndex - b.favoriteIndex);
}

export async function dbUpdatePlaylist(
    playlistId: string,
    updates: {
        name?: string;
        username?: string;
        password?: string;
        serverUrl?: string;
        lastUpdated?: string;
    }
): Promise<{ success: boolean }> {
    const columnByKey: Record<string, string> = {
        name: 'name',
        username: 'username',
        password: 'password',
        serverUrl: 'serverUrl',
        lastUpdated: 'last_updated',
    };
    const entries = Object.entries(updates).filter(
        ([, value]) => value !== undefined
    );
    if (entries.length === 0) {
        return { success: true };
    }

    const assignments = entries.map(([key]) => `${columnByKey[key]} = ?`);
    const values = entries.map(([, value]) => value);
    await run(
        `UPDATE playlists SET ${assignments.join(', ')} WHERE id = ?`,
        [...values, playlistId]
    );
    return { success: true };
}

export async function dbDeletePlaylist(
    playlistId: string
): Promise<{ success: boolean }> {
    await run(`DELETE FROM playlists WHERE id = ?`, [playlistId]);
    return { success: true };
}

export async function dbDeleteAllPlaylists(): Promise<{ success: boolean }> {
    await run(`DELETE FROM playlists`);
    return { success: true };
}
