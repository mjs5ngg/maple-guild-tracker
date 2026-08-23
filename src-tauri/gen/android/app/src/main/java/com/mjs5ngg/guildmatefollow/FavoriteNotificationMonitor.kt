// 즐겨찾기 경험치 알림 작업을 예약하고 권한·실행 이상 상태를 판단합니다.
package com.mjs5ngg.guildmatefollow

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object FavoriteNotificationMonitor {
  const val CHANNEL_ID = "favorite_exp_growth"
  const val KEY_LAST_SUCCESS_AT = "last_success_at"
  const val KEY_LAST_ERROR = "last_error"
  const val KEY_STARTED_AT = "started_at"
  const val KEY_LAST_GUIDE_AT = "last_guide_at"
  const val KEY_PERMISSION_REQUESTED = "permission_requested"
  private const val PREFERENCES = "favorite_notification_monitor"
  private const val PERIODIC_WORK = "favorite-exp-periodic"
  private const val IMMEDIATE_WORK = "favorite-exp-immediate"

  fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun schedule(context: Context) {
    createChannel(context)
    val preferences = preferences(context)
    if (!preferences.contains(KEY_STARTED_AT)) {
      preferences.edit().putLong(KEY_STARTED_AT, System.currentTimeMillis()).apply()
    }
    val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    val periodic = PeriodicWorkRequestBuilder<FavoriteExpWorker>(15, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PERIODIC_WORK,
      ExistingPeriodicWorkPolicy.KEEP,
      periodic,
    )
  }

  fun runNow(context: Context) {
    val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    val request = OneTimeWorkRequestBuilder<FavoriteExpWorker>().setConstraints(constraints).build()
    WorkManager.getInstance(context).enqueueUniqueWork(IMMEDIATE_WORK, ExistingWorkPolicy.REPLACE, request)
  }

  fun startForegroundMonitoring(context: Context) {
    if (!notificationsAllowed(context)) return
    ContextCompat.startForegroundService(
      context,
      Intent(context, FavoriteMonitoringService::class.java),
    )
  }

  fun notificationsAllowed(context: Context): Boolean {
    val runtimeAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    return runtimeAllowed && NotificationManagerCompat.from(context).areNotificationsEnabled()
  }

  fun currentIssue(context: Context): String? {
    if (!notificationsAllowed(context)) return "즐겨찾기 경험치 알림 권한이 꺼져 있습니다."
    val preferences = preferences(context)
    val error = preferences.getString(KEY_LAST_ERROR, "").orEmpty().trim()
    if (error.isNotBlank() && !error.equals("null", ignoreCase = true)) return error
    val now = System.currentTimeMillis()
    val lastSuccess = preferences.getLong(KEY_LAST_SUCCESS_AT, 0L)
    val started = preferences.getLong(KEY_STARTED_AT, now)
    if (lastSuccess == 0L && now - started > 30 * 60 * 1000L) return "즐겨찾기 알림 감시가 아직 정상적으로 실행되지 않았습니다."
    if (lastSuccess > 0L && now - lastSuccess > 60 * 60 * 1000L) return "즐겨찾기 알림 감시가 한 시간 이상 실행되지 않았습니다."
    return null
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(
      CHANNEL_ID,
      "즐겨찾기 경험치 증가",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "대표 캐릭터를 제외한 즐겨찾기 캐릭터의 경험치 증가를 알려줍니다."
    })
  }
}
