/**
 * Wraps the app-local `IptvPlayer` Capacitor plugin (Kotlin, see
 * `android/app/src/main/java/com/jasonr/iptvnator/IptvPlayerPlugin.kt`) that
 * launches a fullscreen native `Activity` running Media3 ExoPlayer.
 *
 * This fills the same UI slot as the desktop app's "external player"
 * (`openInMpv`/`openInVlc`, launching a separate real MPV/VLC process) —
 * Android has no equivalent installed desktop players, so both bridge
 * methods launch the same native Activity. Unlike desktop, there is no
 * "reuse instance" control channel: each call is fire-and-forget, and the
 * returned session cannot be closed or polled for live status from here.
 */

import { registerPlugin } from '@capacitor/core';

interface IptvPlayerPlugin {
    play(options: {
        url: string;
        title?: string;
        userAgent?: string;
        referer?: string;
    }): Promise<void>;
}

const IptvPlayer = registerPlugin<IptvPlayerPlugin>('IptvPlayer');

async function launchNativePlayer(
    player: 'mpv' | 'vlc',
    url: string,
    title: string,
    thumbnail: string,
    userAgent?: string,
    referer?: string
): Promise<Record<string, unknown>> {
    const id = `android-native-player-${Date.now()}`;
    const base = {
        id,
        player,
        title,
        thumbnail,
        streamUrl: url,
        canClose: false,
    };

    try {
        await IptvPlayer.play({ url, title, userAgent, referer });
        return { ...base, status: 'playing' };
    } catch (error) {
        return {
            ...base,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function openInMpv(
    url: string,
    title: string,
    thumbnail: string,
    userAgent?: string,
    referer?: string
): Promise<Record<string, unknown>> {
    return launchNativePlayer('mpv', url, title, thumbnail, userAgent, referer);
}

export function openInVlc(
    url: string,
    title: string,
    thumbnail: string,
    userAgent?: string,
    referer?: string
): Promise<Record<string, unknown>> {
    return launchNativePlayer('vlc', url, title, thumbnail, userAgent, referer);
}

export async function closeExternalPlayerSession(): Promise<null> {
    // No control channel to the native player Activity once launched.
    return null;
}
