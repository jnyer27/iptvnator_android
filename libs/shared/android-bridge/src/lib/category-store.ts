/**
 * Xtream category caching, ported from
 * `apps/electron-backend/src/app/database/operations/category.operations.ts`.
 */

import { query, queryOne, run } from './sqlite-connection';

type CategoryDbType = 'live' | 'movies' | 'series';

interface CategoryRow {
    id: number;
    playlist_id: string;
    name: string;
    type: CategoryDbType;
    xtream_id: number;
    hidden: number;
}

function normalizeXtreamCategoryId(rawCategoryId: string | number): number | null {
    const xtreamId = Number.parseInt(String(rawCategoryId), 10);
    return Number.isNaN(xtreamId) ? null : xtreamId;
}

export async function dbHasCategories(
    playlistId: string,
    type: CategoryDbType
): Promise<boolean> {
    const row = await queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM categories WHERE playlist_id = ? AND type = ?`,
        [playlistId, type]
    );
    return (row?.count ?? 0) > 0;
}

export async function dbGetCategories(
    playlistId: string,
    type: CategoryDbType
): Promise<CategoryRow[]> {
    return query<CategoryRow>(
        `SELECT id, playlist_id, name, type, xtream_id, hidden
         FROM categories
         WHERE playlist_id = ? AND type = ? AND hidden = 0
         ORDER BY id`,
        [playlistId, type]
    );
}

export async function dbGetAllCategories(
    playlistId: string,
    type: CategoryDbType
): Promise<CategoryRow[]> {
    return query<CategoryRow>(
        `SELECT id, playlist_id, name, type, xtream_id, hidden
         FROM categories
         WHERE playlist_id = ? AND type = ?
         ORDER BY name COLLATE NOCASE`,
        [playlistId, type]
    );
}

export async function dbSaveCategories(
    playlistId: string,
    categories: { category_id: string | number; category_name: string }[],
    type: CategoryDbType,
    hiddenCategoryXtreamIds?: number[]
): Promise<{ success: boolean }> {
    if (!categories || categories.length === 0) {
        return { success: true };
    }

    const alreadyImported = await dbHasCategories(playlistId, type);
    if (alreadyImported) {
        return { success: true };
    }

    const hiddenSet = new Set(hiddenCategoryXtreamIds ?? []);
    for (const category of categories) {
        const xtreamId = normalizeXtreamCategoryId(category.category_id);
        if (xtreamId === null) {
            continue;
        }
        await run(
            `INSERT INTO categories (playlist_id, name, type, xtream_id, hidden)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(playlist_id, type, xtream_id) DO NOTHING`,
            [
                playlistId,
                category.category_name,
                type,
                xtreamId,
                hiddenSet.has(xtreamId) ? 1 : 0,
            ]
        );
    }

    return { success: true };
}

export async function dbUpdateCategoryVisibility(
    categoryIds: number[],
    hidden: boolean
): Promise<{ success: boolean }> {
    if (categoryIds.length === 0) {
        return { success: true };
    }

    const placeholders = categoryIds.map(() => '?').join(', ');
    await run(
        `UPDATE categories SET hidden = ? WHERE id IN (${placeholders})`,
        [hidden ? 1 : 0, ...categoryIds]
    );
    return { success: true };
}
