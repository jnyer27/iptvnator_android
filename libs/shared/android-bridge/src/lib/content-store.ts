/**
 * Xtream content (streams/VOD/series) caching, ported from
 * `apps/electron-backend/src/app/database/operations/content.operations.ts`.
 *
 * `dbSearchContent` uses a plain `LIKE` scan rather than the desktop
 * version's FTS5/prefix-index cascade — that logic exists there to keep
 * 90k+ channel catalogs fast; Android content sets are comparatively small,
 * and `content_title_fts` is still created in the schema for a later pass.
 */

import { query, queryOne, run } from './sqlite-connection';

type ContentType = 'live' | 'movie' | 'series';
type CategoryDbType = 'live' | 'movies' | 'series';

interface ContentRow {
    id: number;
    category_id: number;
    title: string;
    rating: string | null;
    added: string | null;
    poster_url: string | null;
    epg_channel_id: string | null;
    tv_archive: number | null;
    tv_archive_duration: number | null;
    direct_source: string | null;
    xtream_id: number;
    type: ContentType;
}

const CONTENT_SELECT_COLUMNS =
    'id, category_id, title, rating, added, poster_url, epg_channel_id, tv_archive, tv_archive_duration, direct_source, xtream_id, type';

function toDbCategoryType(type: ContentType): CategoryDbType {
    return type === 'series' ? 'series' : type === 'movie' ? 'movies' : 'live';
}

export async function dbHasContent(
    playlistId: string,
    type: ContentType
): Promise<boolean> {
    const row = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM content c
         INNER JOIN categories cat ON c.category_id = cat.id
         WHERE cat.playlist_id = ? AND c.type = ?`,
        [playlistId, type]
    );
    return (row?.count ?? 0) > 0;
}

export async function dbGetContent(
    playlistId: string,
    type: ContentType
): Promise<ContentRow[]> {
    const orderBy = type === 'live' ? 'c.id ASC' : 'c.added DESC';
    return query<ContentRow>(
        `SELECT ${CONTENT_SELECT_COLUMNS.replace(/(^|, )/g, '$1c.')}
         FROM content c
         INNER JOIN categories cat ON c.category_id = cat.id
         WHERE cat.playlist_id = ? AND c.type = ?
         ORDER BY ${orderBy}`,
        [playlistId, type]
    );
}

interface XtreamStreamSource {
    category_id?: string | number;
    rating?: string | number;
    rating_imdb?: string;
    last_modified?: string;
    added?: string;
    stream_icon?: string;
    poster?: string;
    cover?: string;
    name?: string;
    title?: string;
    epg_channel_id?: string;
    tv_archive?: string | number;
    tv_archive_duration?: string | number;
    direct_source?: string;
    series_id?: string | number;
    stream_id?: string | number;
}

function toAddedEpochSeconds(value: string | undefined): string {
    if (!value) {
        return '';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '';
    }
    // Xtream sometimes reports milliseconds; normalize to 10-digit seconds.
    return String(
        numeric >= 10_000_000_000 ? Math.trunc(numeric / 1000) : Math.trunc(numeric)
    );
}

export async function dbSaveContent(
    playlistId: string,
    streams: Record<string, unknown>[],
    type: ContentType
): Promise<{ success: boolean; count: number }> {
    const alreadyImported = await dbHasContent(playlistId, type);
    if (alreadyImported) {
        const row = await queryOne<{ count: number }>(
            `SELECT COUNT(*) AS count
             FROM content c
             INNER JOIN categories cat ON c.category_id = cat.id
             WHERE cat.playlist_id = ? AND c.type = ?`,
            [playlistId, type]
        );
        return { success: true, count: row?.count ?? 0 };
    }

    const dbCategoryType = toDbCategoryType(type);
    const categories = await query<{ id: number; xtream_id: number }>(
        `SELECT id, xtream_id FROM categories WHERE playlist_id = ? AND type = ?`,
        [playlistId, dbCategoryType]
    );
    const categoryMap = new Map(
        categories.map((category) => [category.xtream_id, category.id])
    );

    let inserted = 0;
    for (const stream of streams) {
        const source = stream as XtreamStreamSource;
        const streamCategoryId = parseInt(String(source.category_id ?? '0'), 10);
        const categoryId = categoryMap.get(streamCategoryId);
        if (!categoryId) {
            continue;
        }

        const title =
            type === 'series'
                ? source.title ||
                  source.name ||
                  `Unknown Series ${source.series_id ?? ''}`.trim()
                : source.name ||
                  source.title ||
                  `Unknown Stream ${source.stream_id ?? ''}`.trim();
        const xtreamId =
            type === 'series'
                ? parseInt(String(source.series_id ?? '0'), 10)
                : parseInt(String(source.stream_id ?? '0'), 10);

        await run(
            `INSERT INTO content (
                category_id, title, rating, added, poster_url, epg_channel_id,
                tv_archive, tv_archive_duration, direct_source, xtream_id, type
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(category_id, type, xtream_id) DO NOTHING`,
            [
                categoryId,
                title,
                String(source.rating ?? source.rating_imdb ?? ''),
                toAddedEpochSeconds(
                    type === 'series'
                        ? (source.last_modified ?? source.added)
                        : (source.added ?? source.last_modified)
                ),
                String(source.stream_icon ?? source.poster ?? source.cover ?? ''),
                type === 'live' ? (source.epg_channel_id ?? null) : null,
                type === 'live'
                    ? (Number.parseInt(String(source.tv_archive ?? '0'), 10) ?? 0)
                    : null,
                type === 'live'
                    ? (Number.parseInt(
                          String(source.tv_archive_duration ?? '0'),
                          10
                      ) ?? 0)
                    : null,
                type === 'live' ? (source.direct_source ?? null) : null,
                xtreamId,
                type,
            ]
        );
        inserted += 1;
    }

    return { success: true, count: inserted };
}

export async function dbGetContentByXtreamId(
    xtreamId: number,
    playlistId: string,
    contentType?: ContentType
): Promise<ContentRow | null> {
    const typeFilter = contentType ? 'AND c.type = ?' : '';
    const values = contentType
        ? [xtreamId, playlistId, contentType]
        : [xtreamId, playlistId];

    return queryOne<ContentRow>(
        `SELECT ${CONTENT_SELECT_COLUMNS.replace(/(^|, )/g, '$1c.')}
         FROM content c
         INNER JOIN categories cat ON c.category_id = cat.id
         WHERE c.xtream_id = ? AND cat.playlist_id = ? ${typeFilter}
         LIMIT 1`,
        values
    );
}

export async function dbSearchContent(
    playlistId: string,
    searchTerm: string,
    types: string[],
    excludeHidden?: boolean
): Promise<ContentRow[]> {
    const trimmed = searchTerm.trim();
    if (!trimmed || types.length === 0) {
        return [];
    }

    const typePlaceholders = types.map(() => '?').join(', ');
    const hiddenClause = excludeHidden ? 'AND cat.hidden = 0' : '';
    return query<ContentRow>(
        `SELECT ${CONTENT_SELECT_COLUMNS.replace(/(^|, )/g, '$1c.')}
         FROM content c
         INNER JOIN categories cat ON c.category_id = cat.id
         WHERE cat.playlist_id = ? AND c.type IN (${typePlaceholders})
           AND c.title LIKE ? ESCAPE '\\' ${hiddenClause}
         ORDER BY c.title
         LIMIT 50`,
        [playlistId, ...types, `%${trimmed.replace(/[%_\\]/g, '\\$&')}%`]
    );
}

export async function dbClearXtreamImportCache(
    playlistId: string,
    type: ContentType
): Promise<{ success: boolean }> {
    const dbCategoryType = toDbCategoryType(type);
    await run(
        `DELETE FROM content WHERE category_id IN (
            SELECT id FROM categories WHERE playlist_id = ? AND type = ?
         )`,
        [playlistId, dbCategoryType]
    );
    await run(`DELETE FROM categories WHERE playlist_id = ? AND type = ?`, [
        playlistId,
        dbCategoryType,
    ]);
    return { success: true };
}
