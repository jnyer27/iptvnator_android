package com.jasonr.iptvnator

import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bridges the Android port's "external player" launch (the equivalent of the
 * desktop app's `openInMpv`/`openInVlc`) to a dedicated fullscreen native
 * Activity backed by Media3 ExoPlayer. See
 * docs/architecture/android-capacitor-bridge.md for why this is a separate
 * Activity rather than a video surface embedded in the WebView UI.
 */
@CapacitorPlugin(name = "IptvPlayer")
class IptvPlayerPlugin : Plugin() {
    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("url is required")
            return
        }

        val intent = Intent(context, NativePlayerActivity::class.java).apply {
            putExtra(NativePlayerActivity.EXTRA_URL, url)
            putExtra(NativePlayerActivity.EXTRA_TITLE, call.getString("title") ?: "")
            putExtra(NativePlayerActivity.EXTRA_USER_AGENT, call.getString("userAgent"))
            putExtra(NativePlayerActivity.EXTRA_REFERER, call.getString("referer"))
        }
        activity.startActivity(intent)
        call.resolve()
    }
}
