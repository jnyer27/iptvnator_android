package com.jasonr.iptvnator

import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView

private const val TAG = "NativePlayerActivity"

/**
 * Fullscreen native playback surface for the Android port, backed by Media3
 * ExoPlayer. Launched via [IptvPlayerPlugin] as a standalone Activity rather
 * than a video surface embedded in the Capacitor WebView UI — native video
 * surfaces paint outside the WebView's compositing model, the same
 * constraint the desktop app's native-view Embedded MPV engine works around
 * with its own separate controls dock instead of the shared DOM
 * player-controls UI (see docs/architecture/player-controls-contract.md).
 */
class NativePlayerActivity : AppCompatActivity() {
    private var player: ExoPlayer? = null

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_USER_AGENT = "userAgent"
        const val EXTRA_REFERER = "referer"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        title = intent.getStringExtra(EXTRA_TITLE)

        val playerView = PlayerView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            useController = true
        }
        setContentView(playerView)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrEmpty()) {
            finish()
            return
        }

        val userAgent = intent.getStringExtra(EXTRA_USER_AGENT)?.ifEmpty { null }
            ?: "IPTVnatorAndroid"
        val referer = intent.getStringExtra(EXTRA_REFERER)

        // Android's HttpURLConnection transparently requests gzip and
        // decompresses the response unless told otherwise. Some minimal
        // embedded HTTP servers (e.g. HDHomeRun tuners) handle that poorly
        // for a raw binary MPEG-TS stream, so it's disabled explicitly here.
        val requestProperties = buildMap {
            put("Accept-Encoding", "identity")
            if (!referer.isNullOrEmpty()) {
                put("Referer", referer)
            }
        }
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(userAgent)
            .setDefaultRequestProperties(requestProperties)

        val exoPlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpDataSourceFactory))
            .build()
        player = exoPlayer
        playerView.player = exoPlayer

        exoPlayer.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "Playback error: ${error.errorCodeName}", error)
            }
        })

        // Let DefaultMediaSourceFactory infer the format itself: HLS
        // `.m3u8` manifests need HlsMediaSource, while extension-less raw
        // MPEG-TS URLs (e.g. HDHomeRun tuners) are still identified
        // correctly via content sniffing in ProgressiveMediaSource. Forcing
        // a MIME type here would break one or the other.
        exoPlayer.setMediaItem(MediaItem.fromUri(url))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    override fun onStop() {
        super.onStop()
        player?.pause()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }
}
