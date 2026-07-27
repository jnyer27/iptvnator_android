import {
    CapacitorSQLite,
    SQLiteConnection,
    SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { CREATE_TABLE_STATEMENTS } from './schema-sql';

const DATABASE_NAME = 'iptvnator';

let connectionPromise: Promise<SQLiteDBConnection> | null = null;

/**
 * Runs schema statements one at a time and logs (rather than throws) on
 * failure. FTS5 support depends on the SQLite build packaged by the Android
 * OS/plugin; if a `USING fts5(...)` statement is rejected, every other table
 * still gets created instead of the whole schema init failing.
 */
async function createSchema(db: SQLiteDBConnection): Promise<void> {
    for (const statement of CREATE_TABLE_STATEMENTS) {
        try {
            await db.execute(statement);
        } catch (error) {
            console.warn(
                '[android-bridge] schema statement failed (continuing):',
                statement.replace(/\s+/g, ' ').trim().slice(0, 120),
                error
            );
        }
    }
}

async function openConnection(): Promise<SQLiteDBConnection> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    const alreadyOpen = (
        await sqlite.isConnection(DATABASE_NAME, false)
    ).result;
    const db = alreadyOpen
        ? await sqlite.retrieveConnection(DATABASE_NAME, false)
        : await sqlite.createConnection(
              DATABASE_NAME,
              false,
              'no-encryption',
              1,
              false
          );

    await db.open();
    await db.execute('PRAGMA foreign_keys = ON;');
    await createSchema(db);
    return db;
}

/** Lazily opens (once) the shared SQLite connection used by the whole bridge. */
export function getDb(): Promise<SQLiteDBConnection> {
    if (!connectionPromise) {
        connectionPromise = openConnection();
    }
    return connectionPromise;
}

export async function run(
    sql: string,
    values: unknown[] = []
): Promise<{ changes: number }> {
    const db = await getDb();
    const result = await db.run(sql, values);
    return { changes: result.changes?.changes ?? 0 };
}

export async function query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = []
): Promise<T[]> {
    const db = await getDb();
    const result = await db.query(sql, values);
    return (result.values ?? []) as T[];
}

export async function queryOne<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = []
): Promise<T | null> {
    const rows = await query<T>(sql, values);
    return rows[0] ?? null;
}
