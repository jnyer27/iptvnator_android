/**
 * Watch history (global and per-playlist), ported from
 * `apps/electron-backend/src/app/database/operations/recently-viewed.operations.ts`.
 */

import { query, queryOne, run } from './sqlite-connection';
import { persistContentBackdropIfMissing } from './content-store';

interface RecentContentRow {
    id: number;
    category_id: number;
    title: string;
    rating: string | null;
    added: string | null;
    poster_url: string | null;
    backdrop_url: string | null;
    xtream_id: number;
    type: string;
    tv_archive: number | null;
    tv_archive_duration: number | null;
    viewed_at: string | null;
}

interface GlobalRecentRow extends RecentContentRow {
    playlist_id: string;
    playlist_name: string;
}

export async function dbGetRecentlyViewed(): Promise<GlobalRecentRow[]> {
    return query<GlobalRecentRow>(
        `SELECT
            c.id, c.category_id, c.title, c.rating, c.added, c.poster_url,
            c.backdrop_url, c.xtream_id, c.type, c.tv_archive, c.tv_archive_duration,
            cat.playlist_id AS playlist_id, p.name AS playlist_name, rv.viewed_at
         FROM recently_viewed rv
         INNER JOIN content c ON rv.content_id = c.id
         INNER JOIN categories cat ON c.category_id = cat.id
         INNER JOIN playlists p ON cat.playlist_id = p.id
         ORDER BY rv.viewed_at DESC
         LIMIT 100`
    );
}

export async function dbClearRecentlyViewed(): Promise<{ success: boolean }> {
    await run(`DELETE FROM recently_viewed`);
    return { success: true };
}

export async function dbGetRecentItems(
    playlistId: string
): Promise<RecentContentRow[]> {
    return query<RecentContentRow>(
        `SELECT
            c.id, c.category_id, c.title, c.rating, c.added, c.poster_url,
            c.backdrop_url, c.xtream_id, c.type, c.tv_archive, c.tv_archive_duration,
            rv.viewed_at
         FROM recently_viewed rv
         INNER JOIN content c ON rv.content_id = c.id
         WHERE rv.playlist_id = ?
         ORDER BY rv.viewed_at DESC
         LIMIT 100`,
        [playlistId]
    );
}

export async function dbAddRecentItem(
    contentId: number,
    playlistId: string,
    backdropUrl?: string
): Promise<{ success: boolean }> {
    const existing = await queryOne(
        `SELECT id FROM recently_viewed WHERE content_id = ? AND playlist_id = ?`,
        [contentId, playlistId]
    );

    if (existing) {
        await run(
            `UPDATE recently_viewed SET viewed_at = datetime('now')
             WHERE content_id = ? AND playlist_id = ?`,
            [contentId, playlistId]
        );
    } else {
        await run(
            `INSERT INTO recently_viewed (content_id, playlist_id) VALUES (?, ?)`,
            [contentId, playlistId]
        );
    }

    await persistContentBackdropIfMissing(contentId, backdropUrl);
    return { success: true };
}

export async function dbClearPlaylistRecentItems(
    playlistId: string
): Promise<{ success: boolean }> {
    await run(
        `DELETE FROM recently_viewed WHERE content_id IN (
            SELECT c.id FROM content c
            INNER JOIN categories cat ON c.category_id = cat.id
            WHERE cat.playlist_id = ?
         )`,
        [playlistId]
    );
    return { success: true };
}

export async function dbRemoveRecentItem(
    contentId: number,
    playlistId: string
): Promise<{ success: boolean }> {
    await run(
        `DELETE FROM recently_viewed WHERE content_id = ? AND playlist_id = ?`,
        [contentId, playlistId]
    );
    return { success: true };
}

export async function dbRemoveRecentItemsBatch(
    items: { contentId: number; playlistId: string }[]
): Promise<{ success: boolean; count: number }> {
    if (!Array.isArray(items) || items.length === 0) {
        return { success: true, count: 0 };
    }
    for (const item of items) {
        await run(
            `DELETE FROM recently_viewed WHERE content_id = ? AND playlist_id = ?`,
            [item.contentId, item.playlistId]
        );
    }
    return { success: true, count: items.length };
}
