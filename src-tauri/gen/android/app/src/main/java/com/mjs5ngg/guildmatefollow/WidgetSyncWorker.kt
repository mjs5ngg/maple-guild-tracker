// 앱이 닫힌 동안 대표·즐겨찾기 정보를 동기화하고 홈 위젯을 갱신합니다.
package com.mjs5ngg.guildmatefollow

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.webkit.CookieManager
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import io.crates.keyring.Keyring
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class WidgetSyncWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  private val publicOrigin = "https://maple-exp-public.mjs5ng.workers.dev"
  companion object {
    init {
      System.loadLibrary("maple_guild_tracker_lib")
    }

    @JvmStatic
    private external fun syncAndBuildSnapshot(dbPath: String): String?
  }

  override fun doWork(): Result {
    if (!WidgetSyncScheduler.hasWidgets(applicationContext)) return Result.success()
    return try {
      val remote = fetchPublicSnapshot()
      if (remote != null) {
        WidgetSnapshotStore.save(applicationContext, remote)
        WidgetSnapshotStore.cacheImagesAndRefresh(applicationContext, remote)
        return Result.success()
      }
      Keyring.initializeNdkContext(applicationContext)
      val database = File(applicationContext.applicationInfo.dataDir, "tracker.sqlite3")
      if (!database.isFile) return Result.success()
      val rawSnapshot = syncAndBuildSnapshot(database.absolutePath) ?: return Result.retry()
      val snapshot = JSONObject(rawSnapshot)
      WidgetSnapshotStore.save(applicationContext, snapshot)
      WidgetSnapshotStore.cacheImagesAndRefresh(applicationContext, snapshot)
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  private fun fetchPublicSnapshot(): JSONObject? {
    val cookies = CookieManager.getInstance()
    fun request(path: String, method: String = "GET"): JSONObject? {
      val connection = URL("$publicOrigin$path").openConnection() as HttpURLConnection
      return try {
        connection.requestMethod = method
        connection.connectTimeout = 8_000
        connection.readTimeout = 12_000
        connection.setRequestProperty("Accept", "application/json")
        cookies.getCookie(publicOrigin)?.takeIf(String::isNotBlank)?.let { connection.setRequestProperty("Cookie", it) }
        if (method == "POST") {
          connection.doOutput = true
          connection.setRequestProperty("Content-Type", "application/json")
          connection.outputStream.use { it.write("{}".toByteArray()) }
        }
        val status = connection.responseCode
        connection.headerFields.entries.firstOrNull { it.key?.equals("set-cookie", ignoreCase = true) == true }
          ?.value?.forEach { cookies.setCookie(publicOrigin, it.substringBefore(';')) }
        if (status !in 200..299) null else JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      } finally {
        connection.disconnect()
      }
    }
    var me = request("/api/me")
    if (me == null && request("/api/device", "POST") != null) {
      cookies.flush()
      me = request("/api/me")
    }
    val dashboard = request("/api/dashboard") ?: return null
    return me?.let { publicWidgetSnapshot(it, dashboard) }
  }
}

object WidgetSyncScheduler {
  private const val WORK_NAME = "maple-home-widget-periodic-sync"

  fun ensureScheduled(context: Context) {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()
    val request = PeriodicWorkRequestBuilder<WidgetSyncWorker>(15, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
      WORK_NAME,
      ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }

  fun hasWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    return listOf(
      FavoriteRankingWidgetProvider::class.java,
      PrimaryWeeklyWidgetProvider::class.java,
      PrimarySquareWidgetProvider::class.java,
      PrimaryCombinedWidgetProvider::class.java,
    ).any { provider -> manager.getAppWidgetIds(ComponentName(context, provider)).isNotEmpty() }
  }
}
