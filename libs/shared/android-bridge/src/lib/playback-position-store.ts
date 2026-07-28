/**
 * Resume/playback-position tracking, ported from
 * `apps/electron-backend/src/app/database/operations/playback-position.operations.ts`.
 */

import { query, queryOne, run } from './sqlite-connection';

type ContentType = 'vod' | 'episode';
type PlaylistType = 'xtream' | 'stalker' | 'm3u-file' | 'm3u-text' | 'm3u-url';

interface PlaybackPositionInput {
    contentXtreamId: number;
    contentType: ContentType;
    seriesXtreamId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    positionSeconds: number;
    durationSeconds?: number;
    playlistType?: PlaylistType;
}

export interface PlaybackPositionRow {
    id: number;
    playlist_id: string;
    content_xtream_id: number;
    content_type: ContentType;
    series_xtream_id: number | null;
    season_number: number | null;
    episode_number: number | null;
    position_seconds: number;
    duration_seconds: number | null;
    updated_at: string | null;
}

async function ensurePlaylistExists(
    playlistId: string,
    playlistType: PlaylistType = 'stalker'
): Promise<void> {
    const existing = await queryOne(`SELECT id FROM playlists WHERE id = ?`, [
        playlistId,
    ]);
    if (!existing) {
        await run(
            `INSERT INTO playlists (id, name, type) VALUES (?, ?, ?)`,
            [playlistId, 'Imported Playlist', playlistType]
        );
    }
}

export async function dbSavePlaybackPosition(
    playlistId: string,
    data: PlaybackPositionInput
): Promise<{ success: boolean }> {
    await ensurePlaylistExists(playlistId, data.playlistType);

    await run(
        `INSERT INTO playback_positions (
            playlist_id, content_xtream_id, content_type, series_xtream_id,
            season_number, episode_number, position_seconds, duration_seconds, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(content_xtream_id, playlist_id, content_type) DO UPDATE SET
            series_xtream_id = excluded.series_xtream_id,
            season_number = excluded.season_number,
            episode_number = excluded.episode_number,
            position_seconds = excluded.position_seconds,
            duration_seconds = excluded.duration_seconds,
            updated_at = excluded.updated_at`,
        [
            playlistId,
            data.contentXtreamId,
            data.contentType,
            data.seriesXtreamId ?? null,
            data.seasonNumber ?? null,
            data.episodeNumber ?? null,
            data.positionSeconds,
            data.durationSeconds ?? null,
        ]
    );
    return { success: true };
}

export async function dbGetPlaybackPosition(
    playlistId: string,
    contentXtreamId: number,
    contentType: ContentType
): Promise<PlaybackPositionRow | null> {
    return queryOne<PlaybackPositionRow>(
        `SELECT * FROM playback_positions
         WHERE playlist_id = ? AND content_xtream_id = ? AND content_type = ?`,
        [playlistId, contentXtreamId, contentType]
    );
}

export async function dbGetSeriesPlaybackPositions(
    playlistId: string,
    seriesXtreamId: number
): Promise<PlaybackPositionRow[]> {
    return query<PlaybackPositionRow>(
        `SELECT * FROM playback_positions
         WHERE playlist_id = ? AND series_xtream_id = ? AND content_type = 'episode'`,
        [playlistId, seriesXtreamId]
    );
}

export async function dbGetRecentPlaybackPositions(
    playlistId: string,
    limit = 20
): Promise<PlaybackPositionRow[]> {
    return query<PlaybackPositionRow>(
        `SELECT * FROM playback_positions
         WHERE playlist_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
        [playlistId, limit]
    );
}

export async function dbGetAllPlaybackPositions(
    playlistId: string
): Promise<PlaybackPositionRow[]> {
    return query<PlaybackPositionRow>(
        `SELECT * FROM playback_positions WHERE playlist_id = ?`,
        [playlistId]
    );
}

export async function dbClearAllPlaybackPositions(
    playlistId: string
): Promise<{ success: boolean }> {
    await run(`DELETE FROM playback_positions WHERE playlist_id = ?`, [
        playlistId,
    ]);
    return { success: true };
}

export async function dbClearPlaybackPosition(
    playlistId: string,
    contentXtreamId: number,
    contentType: ContentType
): Promise<{ success: boolean }> {
    await run(
        `DELETE FROM playback_positions
         WHERE playlist_id = ? AND content_xtream_id = ? AND content_type = ?`,
        [playlistId, contentXtreamId, contentType]
    );
    return { success: true };
}
