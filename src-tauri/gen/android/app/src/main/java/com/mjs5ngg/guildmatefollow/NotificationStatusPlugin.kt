// 모바일 알림 권한과 백그라운드 감시 상태를 설정 화면에 전달합니다.
package com.mjs5ngg.guildmatefollow

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class NotificationStatusPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun getStatus(invoke: Invoke) {
    val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val systemEnabled = NotificationManagerCompat.from(activity).areNotificationsEnabled()
    val channelEnabled = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      true
    } else {
      val manager = activity.getSystemService(NotificationManager::class.java)
      val channel = manager.getNotificationChannel(FavoriteNotificationMonitor.CHANNEL_ID)
      channel != null && channel.importance != NotificationManager.IMPORTANCE_NONE
    }
    val preferences = FavoriteNotificationMonitor.preferences(activity)
    val issue = FavoriteNotificationMonitor.currentIssue(activity)
    val lastSuccess = preferences.getLong(FavoriteNotificationMonitor.KEY_LAST_SUCCESS_AT, 0L)
    val storedError = preferences.getString(FavoriteNotificationMonitor.KEY_LAST_ERROR, "").orEmpty().trim()
    val hasError = storedError.isNotBlank() && !storedError.equals("null", ignoreCase = true)
    val monitoringHealthy = permissionGranted && systemEnabled && channelEnabled &&
      lastSuccess > 0L && System.currentTimeMillis() - lastSuccess <= 60 * 60 * 1000L && !hasError
    invoke.resolve(JSObject().apply {
      put("supported", true)
      put("permission_granted", permissionGranted)
      put("system_enabled", systemEnabled)
      put("channel_enabled", channelEnabled)
      put("monitoring_healthy", monitoringHealthy)
      put("issue", issue.orEmpty())
      put("last_success_at", lastSuccess.takeIf { it > 0L })
    })
  }

  @Command
  fun openSettings(invoke: Invoke) {
    activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
      putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    })
    invoke.resolve()
  }

  @Command
  fun openBackgroundSettings(invoke: Invoke) {
    activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      data = Uri.parse("package:${activity.packageName}")
    })
    invoke.resolve()
  }

  @Command
  fun retry(invoke: Invoke) {
    FavoriteNotificationMonitor.runNow(activity.applicationContext)
    invoke.resolve()
  }
}
