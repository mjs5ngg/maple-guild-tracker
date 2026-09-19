// 길드원 따라가기 Android 앱의 기본 액티비티를 제공합니다.
package com.guildfollow.mobile

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.view.View
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import io.crates.keyring.Keyring
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom

class MainActivity : TauriActivity() {
  companion object {
    @JvmStatic private external fun storeServiceKey(value: String): Boolean
    @JvmStatic private external fun importDirectSnapshots(dbPath: String, payload: String): Boolean
  }
  override val handleBackNavigation: Boolean = true
  private val publicOrigin = "https://guildfollow.com"
  private var dashboardWebView: WebView? = null
  private var pendingLoginCode: String? = null

  private inner class AndroidAuthBridge {
    @JavascriptInterface
    fun startGoogleLogin() {
      Thread { beginGoogleLogin() }.start()
    }

    // 앱 내장 화면은 교차 출처라 쿠키 대신 이 토큰을 Bearer로 보냅니다.
    @JavascriptInterface
    fun sessionToken(): String = authPreferences().getString("session", null).orEmpty()

    @JavascriptInterface
    fun clearSession() {
      authPreferences().edit().remove("session").apply()
    }
  }

  private fun authPreferences() = getSharedPreferences("android_auth", MODE_PRIVATE)

  private inner class AndroidDirectBridge {
    @JavascriptInterface
    fun storeServiceKeyOnDevice(value: String): Boolean = value.length <= 2048 && storeServiceKey(value)

    @JavascriptInterface
    fun importSnapshots(payload: String): Boolean {
      if (payload.length > 64 * 1024 * 1024) return false
      val database = File(applicationContext.applicationInfo.dataDir, "tracker.sqlite3")
      return importDirectSnapshots(database.absolutePath, payload)
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
    webView.addJavascriptInterface(AndroidDirectBridge(), "AndroidDirect")
    pendingLoginCode?.let { exchangeLogin(it) }
    keepContentInsideSystemBars(webView)
  }

  // 내장 화면이 상태 표시줄·내비게이션 막대·키보드 아래로 들어가지 않도록 여백을 둡니다.
  private fun keepContentInsideSystemBars(webView: WebView) {
    // WebView는 이 시점에 아직 부모에 붙지 않았을 수 있어 항상 존재하는 콘텐츠 영역에 여백을 줍니다.
    val container = findViewById<View>(android.R.id.content) ?: webView
    container.setBackgroundColor(0xFF0B1220.toInt())
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    // 삼성 3버튼 내비게이션의 밝은 반투명 막을 없애 앱 배경과 맞춥니다.
    if (android.os.Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
    ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(container)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleLoginIntent(intent)
  }

  private fun handleLoginIntent(intent: Intent?) {
    val code = intent?.data?.takeIf { it.scheme == "guildfollow" && it.host == "auth" }?.getQueryParameter("code") ?: return
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
      authPreferences().getString("session", null)?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
      connection.outputStream.use { it.write(body.toString().toByteArray()) }
      if (connection.responseCode !in 200..299) null else JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
    } finally {
      connection.disconnect()
    }
  }

  private fun beginGoogleLogin() {
    val verifier = randomVerifier()
    val response = runCatching { request("/auth/android/start-v2", JSONObject().put("challenge", challenge(verifier))) }.getOrNull()
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
      preferences.edit().remove("pkce_verifier").putString("session", session).apply()
      runOnUiThread {
        dashboardWebView?.evaluateJavascript("location.hash='settings';window.dispatchEvent(new Event('android-login'))", null)
      }
    }.start()
  }

  private fun showLoginError() {
    runOnUiThread { Toast.makeText(this, "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.", Toast.LENGTH_LONG).show() }
  }
}
