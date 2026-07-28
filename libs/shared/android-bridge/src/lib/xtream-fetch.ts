/**
 * Xtream Codes API proxying for the Android bridge. Ported from
 * `apps/electron-backend/src/app/events/xtream.events.ts`: same
 * `player_api.php` URL construction and VLC User-Agent spoofing (some Xtream
 * panels sit behind a WAF that challenges generic browser UAs but allowlists
 * known IPTV client UAs).
 *
 * Uses the app-local `XtreamHttp` Capacitor plugin (Kotlin, real OkHttp)
 * rather than `@capacitor/core`'s `CapacitorHttp` (`HttpURLConnection` on
 * Android). Verified directly against a real account/server: a known-working
 * Android app using OkHttp gets a normal response from some panels while
 * `curl`, the JDK's `HttpClient`, and `HttpURLConnection`-based
 * `CapacitorHttp` all get a decoy 404 from the same server, same network
 * path, same credentials, same moment. Matching the proven client stack
 * sidesteps that rather than chasing the exact server-side rule.
 *
 * Note: unlike the desktop version, in-flight requests cannot be cancelled —
 * each call is a single native bridge round-trip with no abort hook.
 * `xtreamCancelSession` is a no-op stub kept only so callers that optionally
 * invoke it don't need a feature check.
 */

import { registerPlugin } from '@capacitor/core';
import { normalizeXtreamServerUrl } from '@iptvnator/shared/interfaces';

interface XtreamHttpResponse {
    status: number;
    data: string;
    headers: Record<string, string>;
    url: string;
}

interface XtreamHttpPlugin {
    get(options: {
        url: string;
        method?: 'GET' | 'HEAD';
        headers?: Record<string, string>;
    }): Promise<XtreamHttpResponse>;
}

const XtreamHttp = registerPlugin<XtreamHttpPlugin>('XtreamHttp');

const XTREAM_CLIENT_USER_AGENT = 'VLC/3.0.18 LibVLC/3.0.18';

function buildXtreamApiUrl(url: string, params: Record<string, string>): string {
    const baseUrl = normalizeXtreamServerUrl(url);
    const apiUrl = new URL(`${baseUrl}/player_api.php`);
    Object.entries(params ?? {}).forEach(([key, value]) => {
        apiUrl.searchParams.append(
            key,
            key === 'username' || key === 'password' ? value.trim() : value
        );
    });
    return apiUrl.toString();
}

function parseJsonBody(data: string): unknown {
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

export async function xtreamRequest(payload: {
    url: string;
    params: Record<string, string>;
}): Promise<{ payload: unknown; action?: string }> {
    const apiUrl = buildXtreamApiUrl(payload.url, payload.params);

    try {
        const response = await XtreamHttp.get({
            url: apiUrl,
            headers: {
                'User-Agent': XTREAM_CLIENT_USER_AGENT,
                Accept: 'application/json',
            },
        });

        if (response.status >= 400) {
            throw {
                type: 'ERROR',
                message: `HTTP Error: ${response.status}`,
                status: response.status,
            };
        }

        return {
            payload: parseJsonBody(response.data),
            action: payload.params?.action,
        };
    } catch (error) {
        if (error && typeof error === 'object' && 'type' in error) {
            throw error;
        }
        throw {
            type: 'ERROR',
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch data from Xtream server',
            status: 500,
        };
    }
}

export async function xtreamCancelSession(): Promise<{
    success: boolean;
    cancelled: number;
}> {
    return { success: false, cancelled: 0 };
}

export async function xtreamProbeUrl(
    url: string,
    method: 'GET' | 'HEAD' = 'HEAD'
): Promise<{ status: number; url: string; error?: string }> {
    try {
        const response = await XtreamHttp.get({
            url,
            method,
            headers: {
                'User-Agent': XTREAM_CLIENT_USER_AGENT,
                ...(method === 'GET' ? { Range: 'bytes=0-4095' } : {}),
            },
        });

        return { status: response.status, url };
    } catch (error) {
        return {
            status: 0,
            url,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
