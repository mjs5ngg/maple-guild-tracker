// 길드원 따라가기 Android 앱의 기본 액티비티를 제공합니다.
package com.mjs5ngg.guildmatefollow

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import io.crates.keyring.Keyring
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = true
  private val publicOrigin = "https://maple-exp-public.mjs5ng.workers.dev"
  private var dashboardWebView: WebView? = null
  private var pendingLoginCode: String? = null

  private inner class AndroidAuthBridge {
    @JavascriptInterface
    fun startGoogleLogin() {
      Thread { beginGoogleLogin() }.start()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    Keyring.initializeNdkContext(applicationContext)
    super.onCreate(savedInstanceState)
    WidgetSyncScheduler.ensureScheduled(applicationContext)
    handleLoginIntent(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    dashboardWebView = webView
    webView.addJavascriptInterface(AndroidAuthBridge(), "AndroidAuth")
    pendingLoginCode?.let { exchangeLogin(it) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleLoginIntent(intent)
  }

  private fun handleLoginIntent(intent: Intent?) {
    val code = intent?.data?.takeIf { it.scheme == "guildmatefollow" && it.host == "auth" }?.getQueryParameter("code") ?: return
    pendingLoginCode = code
    if (dashboardWebView != null) exchangeLogin(code)
  }

  private fun randomVerifier(): String = ByteArray(48).also(SecureRandom()::nextBytes)
    .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }

  private fun challenge(verifier: String): String = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
    .let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }

  private fun request(path: String, body: JSONObject): JSONObject? {
    val connection = URL("$publicOrigin$path").openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 8_000
      connection.readTimeout = 12_000
      connection.doOutput = true
      connection.setRequestProperty("Origin", publicOrigin)
      connection.setRequestProperty("Content-Type", "application/json")
      CookieManager.getInstance().getCookie(publicOrigin)?.let { connection.setRequestProperty("Cookie", it) }
      connection.outputStream.use { it.write(body.toString().toByteArray()) }
      if (connection.responseCode !in 200..299) null else JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
    } finally {
      connection.disconnect()
    }
  }

  private fun beginGoogleLogin() {
    val verifier = randomVerifier()
    val response = runCatching { request("/auth/android/start", JSONObject().put("challenge", challenge(verifier))) }.getOrNull()
    val url = response?.optString("url").orEmpty()
    if (url.isBlank()) return showLoginError()
    getSharedPreferences("android_auth", MODE_PRIVATE).edit().putString("pkce_verifier", verifier).apply()
    runOnUiThread { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
  }

  private fun exchangeLogin(code: String) {
    pendingLoginCode = null
    Thread {
      val preferences = getSharedPreferences("android_auth", MODE_PRIVATE)
      val verifier = preferences.getString("pkce_verifier", null)
      val response = verifier?.let { runCatching { request("/auth/android/exchange", JSONObject().put("code", code).put("verifier", it)) }.getOrNull() }
      val session = response?.optString("session").orEmpty()
      if (session.isBlank()) return@Thread showLoginError()
      preferences.edit().remove("pkce_verifier").apply()
      CookieManager.getInstance().setCookie(publicOrigin, "maple_session=$session; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure")
      CookieManager.getInstance().flush()
      runOnUiThread { dashboardWebView?.loadUrl("$publicOrigin/#settings") }
    }.start()
  }

  private fun showLoginError() {
    runOnUiThread { Toast.makeText(this, "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.", Toast.LENGTH_LONG).show() }
  }
}
