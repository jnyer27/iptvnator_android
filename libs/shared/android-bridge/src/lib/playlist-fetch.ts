/**
 * Playlist acquisition (URL fetch / local file import) for the Android
 * bridge. `CapacitorHttp` runs the GET through the native HTTP stack instead
 * of the WebView's `fetch`, which is what lets it bypass the CORS
 * restrictions the desktop Electron main process was also working around.
 */

import { CapacitorHttp } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem } from '@capacitor/filesystem';
import { createPlaylistObject } from '@iptvnator/shared/m3u-utils';
import type { Playlist } from '@iptvnator/shared/interfaces';

type ParsePlaylistFn = (typeof import('iptv-playlist-parser'))['parse'];

async function getParser(): Promise<ParsePlaylistFn> {
    const mod = await import('iptv-playlist-parser');
    return (mod.parse ?? (mod as { default?: { parse?: ParsePlaylistFn } }).default?.parse) as ParsePlaylistFn;
}

function base64ToUtf8(base64: string): string {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

async function fetchTextFromUrl(url: string): Promise<string> {
    const response = await CapacitorHttp.get({
        url,
        responseType: 'text',
        connectTimeout: 30000,
        readTimeout: 30000,
    });

    if (response.status < 200 || response.status >= 400) {
        const error = new Error(
            `Request failed with status code ${response.status}`
        );
        (error as Error & { response?: unknown }).response = {
            status: response.status,
        };
        throw error;
    }

    return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
}

export async function fetchPlaylistByUrl(
    url: string,
    title?: string
): Promise<Playlist> {
    const content = await fetchTextFromUrl(url);
    const parse = await getParser();
    const parsed = parse(content);
    const name = title?.trim() || url;
    return createPlaylistObject(name, parsed, url, 'URL');
}

export async function openPlaylistFromFile(): Promise<Playlist | null> {
    const result = await FilePicker.pickFiles({
        types: ['*/*'],
        readData: true,
        limit: 1,
    });

    const file = result.files[0];
    if (!file?.data) {
        return null;
    }

    const content = base64ToUtf8(file.data);
    const parse = await getParser();
    const parsed = parse(content);
    const name = file.name?.replace(/\.[^.]+$/, '') || 'Untitled playlist';
    return createPlaylistObject(name, parsed, file.path ?? file.name, 'FILE');
}

export async function updatePlaylistFromFilePath(
    filePath: string,
    title: string
): Promise<Playlist> {
    try {
        const read = await Filesystem.readFile({ path: filePath });
        const content =
            typeof read.data === 'string'
                ? read.data.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(read.data)
                    ? base64ToUtf8(read.data)
                    : read.data
                : await read.data.text();
        const parse = await getParser();
        const parsed = parse(content);
        return createPlaylistObject(title, parsed, filePath, 'FILE');
    } catch (error) {
        throw new Error(
            `Playlist file not found or unreadable: ${filePath} (${String(error)})`
        );
    }
}

export function getPathForFile(): string {
    // Drag-and-drop file paths are a desktop-only concept (Electron exposes a
    // native fs path for dropped `File` objects); Android import always goes
    // through `openPlaylistFromFile`'s system picker instead.
    return '';
}

interface AutoUpdatePlaylistInput {
    _id: string;
    title?: string;
    url?: string;
    filePath?: string;
}

export async function autoUpdatePlaylists(
    playlists: AutoUpdatePlaylistInput[]
): Promise<{
    playlists: Playlist[];
    outcomes: { playlistId: string; title: string; status: string }[];
}> {
    const updated: Playlist[] = [];
    const outcomes: { playlistId: string; title: string; status: string }[] =
        [];

    for (const playlist of playlists) {
        const title = playlist.title ?? playlist._id;
        try {
            const refreshed = playlist.url
                ? await fetchPlaylistByUrl(playlist.url, title)
                : playlist.filePath
                  ? await updatePlaylistFromFilePath(playlist.filePath, title)
                  : null;

            if (!refreshed) {
                outcomes.push({ playlistId: playlist._id, title, status: 'skipped' });
                continue;
            }

            updated.push({ ...refreshed, _id: playlist._id });
            outcomes.push({ playlistId: playlist._id, title, status: 'updated' });
        } catch (error) {
            console.warn(
                `[android-bridge] auto-update failed for playlist ${playlist._id}:`,
                error
            );
            outcomes.push({ playlistId: playlist._id, title, status: 'failed' });
        }
    }

    return { playlists: updated, outcomes };
}
