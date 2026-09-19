// 앱이 닫힌 동안 대표·즐겨찾기 정보를 동기화하고 홈 위젯을 갱신합니다.
package com.guildfollow.mobile

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.workDataOf
import androidx.work.WorkerParameters
import io.crates.keyring.Keyring
import java.io.File
import java.util.concurrent.TimeUnit

class WidgetSyncWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  companion object {
    init {
      System.loadLibrary("maple_guild_tracker_lib")
    }

    @JvmStatic
    private external fun syncAndBuildSnapshot(dbPath: String): String?

    @JvmStatic
    private external fun buildSnapshot(dbPath: String): String?
  }

  // 새로고침 버튼으로 시작한 작업은 재시도 대기에 걸리지 않게 실패를 바로 알리고 끝냅니다.
  private val manual get() = inputData.getBoolean(WidgetSyncScheduler.MANUAL_KEY, false)

  private fun manualFailed(): Result {
    applicationContext.getSharedPreferences(MapleWidgetRenderer.PREFERENCES, Context.MODE_PRIVATE).edit()
      .remove(MapleWidgetRenderer.REFRESHING_KEY)
      .putLong(MapleWidgetRenderer.REFRESH_FAILED_KEY, System.currentTimeMillis()).apply()
    MapleWidgetRenderer.updateAll(applicationContext)
    return Result.failure()
  }

  override fun doWork(): Result {
    return try {
      // 홈 화면에 위젯이 없으면 NEXON을 조회하지 않고 끝내 호출 한도를 아낍니다.
      if (!WidgetSyncScheduler.hasWidgets(applicationContext)) return Result.success()
      Keyring.initializeNdkContext(applicationContext)
      val database = File(applicationContext.applicationInfo.dataDir, "tracker.sqlite3")
      if (!database.isFile) return if (manual) manualFailed() else Result.success()
      val rawSnapshot = syncAndBuildSnapshot(database.absolutePath)
      if (rawSnapshot == null) {
        // 조회가 실패해도(예: 앱 화면 조회와 겹쳐 호출 한도 초과) 저장된 기록과 이미지로 위젯을 다시 그립니다.
        buildSnapshot(database.absolutePath)?.let { fallback ->
          val snapshot = org.json.JSONObject(fallback)
          WidgetSnapshotStore.save(applicationContext, snapshot)
          WidgetSnapshotStore.cacheImagesAndRefresh(applicationContext, snapshot)
        }
        return if (manual) manualFailed() else Result.retry()
      }
      val snapshot = org.json.JSONObject(rawSnapshot)
      WidgetSnapshotStore.save(applicationContext, snapshot)
      WidgetSnapshotStore.cacheImagesAndRefresh(applicationContext, snapshot)
      Result.success()
    } catch (_: Exception) {
      if (manual) manualFailed() else Result.retry()
    }
  }

}

object WidgetSyncScheduler {
  private const val WORK_NAME = "maple-home-widget-periodic-sync"
  private const val MANUAL_WORK_NAME = "maple-home-widget-manual-sync"
  const val MANUAL_KEY = "manual"

  // 위젯의 새로고침 버튼: 기다리지 않고 한 번 동기화합니다. 연달아 눌러도 한 번만 실행됩니다.
  fun syncNow(context: Context) {
    val request = OneTimeWorkRequestBuilder<WidgetSyncWorker>()
      .setInputData(workDataOf(MANUAL_KEY to true))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .build()
    WorkManager.getInstance(context.applicationContext)
      .enqueueUniqueWork(MANUAL_WORK_NAME, ExistingWorkPolicy.KEEP, request)
  }

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
