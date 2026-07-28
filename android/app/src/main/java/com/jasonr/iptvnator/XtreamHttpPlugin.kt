package com.jasonr.iptvnator

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Xtream portal requests via real OkHttp instead of `@capacitor/core`'s
 * `CapacitorHttp` (which uses `java.net.HttpURLConnection` on Android).
 *
 * Some Xtream panels behave differently depending on which HTTP client
 * connects — observed directly against a real account/server in this repo:
 * a known-working native Android app using OkHttp gets a normal response,
 * while `curl`, the JDK's `HttpClient`, and `CapacitorHttp`
 * (`HttpURLConnection`) all get a decoy 404 page from the same server, same
 * network path, same credentials, same moment. This plugin matches the
 * proven-working client stack for that request instead of chasing the exact
 * server-side rule that distinguishes them.
 */
@CapacitorPlugin(name = "XtreamHttp")
class XtreamHttpPlugin : Plugin() {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @PluginMethod
    fun get(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("url is required")
            return
        }

        val method = call.getString("method")?.uppercase() ?: "GET"
        val requestBuilder = Request.Builder().url(url)
        if (method == "HEAD") {
            requestBuilder.head()
        } else {
            requestBuilder.get()
        }
        call.getObject("headers")?.let { headers ->
            headers.keys().forEach { key ->
                requestBuilder.addHeader(key, headers.getString(key) ?: "")
            }
        }

        try {
            client.newCall(requestBuilder.build()).execute().use { response ->
                val result = JSObject()
                result.put("status", response.code)
                result.put("data", response.body?.string() ?: "")
                val headersJson = JSObject()
                for (name in response.headers.names()) {
                    headersJson.put(name, response.header(name))
                }
                result.put("headers", headersJson)
                result.put("url", response.request.url.toString())
                call.resolve(result)
            }
        } catch (error: Exception) {
            call.reject(error.message ?: "OkHttp request failed", error)
        }
    }
}
