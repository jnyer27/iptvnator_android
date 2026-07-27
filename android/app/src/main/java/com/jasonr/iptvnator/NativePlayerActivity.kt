package com.jasonr.iptvnator

import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView

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

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(userAgent)
            .also { factory ->
                if (!referer.isNullOrEmpty()) {
                    factory.setDefaultRequestProperties(mapOf("Referer" to referer))
                }
            }

        val exoPlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpDataSourceFactory))
            .build()
        player = exoPlayer
        playerView.player = exoPlayer

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
