/**
 * Favorites (per-playlist and global), ported from
 * `apps/electron-backend/src/app/database/operations/favorites.operations.ts`.
 */

import { query, run } from './sqlite-connection';
import { persistContentBackdropIfMissing } from './content-store';

interface FavoriteContentRow {
    id: number;
    category_id: number;
    title: string;
    rating: string | null;
    added: string | null;
    poster_url: string | null;
    xtream_id: number;
    type: string;
    tv_archive: number | null;
    tv_archive_duration: number | null;
    added_at: string | null;
    position: number | null;
}

interface GlobalFavoriteRow extends FavoriteContentRow {
    backdrop_url?: string | null;
    playlist_id: string;
    playlist_name: string;
}

export async function dbAddFavorite(
    contentId: number,
    playlistId: string,
    backdropUrl?: string
): Promise<{ success: boolean }> {
    await run(
        `INSERT INTO favorites (content_id, playlist_id) VALUES (?, ?)`,
        [contentId, playlistId]
    );
    await persistContentBackdropIfMissing(contentId, backdropUrl);
    return { success: true };
}

export async function dbRemoveFavorite(
    contentId: number,
    playlistId: string
): Promise<{ success: boolean }> {
    await run(
        `DELETE FROM favorites WHERE content_id = ? AND playlist_id = ?`,
        [contentId, playlistId]
    );
    return { success: true };
}

export async function dbIsFavorite(
    contentId: number,
    playlistId: string
): Promise<boolean> {
    const rows = await query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM favorites WHERE content_id = ? AND playlist_id = ?`,
        [contentId, playlistId]
    );
    return (rows[0]?.count ?? 0) > 0;
}

export async function dbGetFavorites(
    playlistId: string
): Promise<FavoriteContentRow[]> {
    return query<FavoriteContentRow>(
        `SELECT
            c.id, c.category_id, c.title, c.rating, c.added, c.poster_url,
            c.xtream_id, c.type, c.tv_archive, c.tv_archive_duration,
            f.added_at, f.position
         FROM favorites f
         INNER JOIN content c ON f.content_id = c.id
         WHERE f.playlist_id = ?
         ORDER BY f.position ASC, f.added_at DESC`,
        [playlistId]
    );
}

const GLOBAL_FAVORITE_COLUMNS = `
    c.id, c.category_id, c.title, c.rating, c.added, c.poster_url,
    c.backdrop_url, c.xtream_id, c.type, c.tv_archive, c.tv_archive_duration,
    p.id AS playlist_id, p.name AS playlist_name, f.added_at, f.position`;

export async function dbGetGlobalFavorites(): Promise<GlobalFavoriteRow[]> {
    const rows = await query<GlobalFavoriteRow>(
        `SELECT ${GLOBAL_FAVORITE_COLUMNS}
         FROM favorites f
         INNER JOIN content c ON f.content_id = c.id
         INNER JOIN categories cat ON c.category_id = cat.id
         INNER JOIN playlists p ON cat.playlist_id = p.id
         ORDER BY f.position ASC, f.added_at DESC`
    );
    return rows.filter((row) => row.type === 'live').slice(0, 300);
}

export async function dbGetAllGlobalFavorites(): Promise<GlobalFavoriteRow[]> {
    return query<GlobalFavoriteRow>(
        `SELECT ${GLOBAL_FAVORITE_COLUMNS}
         FROM favorites f
         INNER JOIN content c ON f.content_id = c.id
         INNER JOIN categories cat ON c.category_id = cat.id
         INNER JOIN playlists p ON cat.playlist_id = p.id
         ORDER BY f.position ASC, f.added_at DESC
         LIMIT 500`
    );
}

export async function dbReorderGlobalFavorites(
    updates: { content_id: number; playlist_id: string; position: number }[]
): Promise<{ success: boolean }> {
    for (const update of updates) {
        await run(
            `UPDATE favorites SET position = ? WHERE content_id = ? AND playlist_id = ?`,
            [update.position, update.content_id, update.playlist_id]
        );
    }
    return { success: true };
}
