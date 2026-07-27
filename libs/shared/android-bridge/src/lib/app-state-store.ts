import { queryOne, run } from './sqlite-connection';

export async function dbGetAppState(key: string): Promise<string | null> {
    const row = await queryOne<{ value: string }>(
        `SELECT value FROM app_state WHERE key = ?`,
        [key]
    );
    return row?.value ?? null;
}

export async function dbSetAppState(
    key: string,
    value: string
): Promise<{ success: boolean }> {
    await run(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value]
    );
    return { success: true };
}
