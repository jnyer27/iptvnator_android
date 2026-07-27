/**
 * Xtream Codes API proxying for the Android bridge. Ported from
 * `apps/electron-backend/src/app/events/xtream.events.ts`: same
 * `player_api.php` URL construction and VLC User-Agent spoofing (some Xtream
 * panels sit behind a WAF that challenges generic browser UAs but allowlists
 * known IPTV client UAs), using `CapacitorHttp` instead of `axios` to bypass
 * the WebView's CORS restrictions.
 *
 * Note: unlike the desktop version, in-flight requests cannot be cancelled —
 * `CapacitorHttp` calls run as a single native bridge call with no abort
 * hook. `xtreamCancelSession` is a no-op stub kept only so callers that
 * optionally invoke it don't need a feature check.
 */

import { CapacitorHttp } from '@capacitor/core';
import { normalizeXtreamServerUrl } from '@iptvnator/shared/interfaces';

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

export async function xtreamRequest(payload: {
    url: string;
    params: Record<string, string>;
}): Promise<{ payload: unknown; action?: string }> {
    const apiUrl = buildXtreamApiUrl(payload.url, payload.params);

    try {
        const response = await CapacitorHttp.get({
            url: apiUrl,
            headers: {
                'User-Agent': XTREAM_CLIENT_USER_AGENT,
                Accept: 'application/json',
            },
            connectTimeout: 30000,
            readTimeout: 30000,
        });

        if (response.status >= 400) {
            throw {
                type: 'ERROR',
                message: `HTTP Error: ${response.status}`,
                status: response.status,
            };
        }

        return { payload: response.data, action: payload.params?.action };
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
        const response =
            method === 'HEAD'
                ? await CapacitorHttp.request({
                      method: 'HEAD',
                      url,
                      headers: { 'User-Agent': XTREAM_CLIENT_USER_AGENT },
                      connectTimeout: 10000,
                      readTimeout: 10000,
                  })
                : await CapacitorHttp.get({
                      url,
                      headers: {
                          'User-Agent': XTREAM_CLIENT_USER_AGENT,
                          Range: 'bytes=0-4095',
                      },
                      connectTimeout: 10000,
                      readTimeout: 10000,
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
