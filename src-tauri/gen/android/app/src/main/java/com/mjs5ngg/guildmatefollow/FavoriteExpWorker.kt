// Android 백그라운드에서 즐겨찾기 경험치를 확인하고 시스템 알림을 발송합니다.
package com.mjs5ngg.guildmatefollow

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import io.crates.keyring.Keyring
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale

class FavoriteExpWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val preferences = FavoriteNotificationMonitor.preferences(applicationContext)
    try {
      Keyring.initializeNdkContext(applicationContext)
      val allowed = FavoriteNotificationMonitor.notificationsAllowed(applicationContext)
      val payload = JSONObject(runNativeCheck(applicationContext.applicationInfo.dataDir, allowed))
      val events = payload.getJSONArray("events")
      if (allowed) {
        for (index in 0 until events.length()) {
          val event = events.getJSONObject(index)
          showNotification(
            event.getString("character_name"),
            event.getLong("gained_exp"),
            event.getString("current_exp_rate"),
          )
        }
      }
      val ok = payload.optBoolean("ok", false)
      val error = if (allowed) payload.optString("error", "") else "즐겨찾기 경험치 알림 권한이 꺼져 있습니다."
      preferences.edit()
        .putLong(FavoriteNotificationMonitor.KEY_LAST_SUCCESS_AT, if (ok) System.currentTimeMillis() else preferences.getLong(FavoriteNotificationMonitor.KEY_LAST_SUCCESS_AT, 0L))
        .putString(FavoriteNotificationMonitor.KEY_LAST_ERROR, error)
        .apply()
      if (ok) Result.success() else Result.retry()
    } catch (error: Throwable) {
      preferences.edit().putString(
        FavoriteNotificationMonitor.KEY_LAST_ERROR,
        "즐겨찾기 알림 확인에 실패했습니다. ${error.message.orEmpty()}",
      ).apply()
      Result.retry()
    }
  }

  private fun showNotification(characterName: String, gainedExp: Long, currentRate: String) {
    val intent = Intent(applicationContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      applicationContext,
      characterName.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(applicationContext, FavoriteNotificationMonitor.CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle("$characterName 경험치 증가")
      .setContentText("+${formatExp(gainedExp)} · 현재 ${currentRate}%")
      .setStyle(NotificationCompat.BigTextStyle().bigText("$characterName 캐릭터의 경험치가 ${formatExp(gainedExp)} 증가했습니다. 현재 경험치는 ${currentRate}%입니다."))
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()
    NotificationManagerCompat.from(applicationContext).notify(characterName.hashCode(), notification)
  }

  private fun formatExp(value: Long): String {
    val units = listOf(1_000_000_000_000L to "조", 100_000_000L to "억", 10_000L to "만")
    val unit = units.firstOrNull { value >= it.first } ?: return String.format(Locale.KOREA, "%,d", value)
    return String.format(Locale.KOREA, "%.1f%s", value.toDouble() / unit.first, unit.second)
  }

  companion object {
    init {
      System.loadLibrary("maple_guild_tracker_lib")
    }

    external fun runNativeCheck(dataDir: String, canNotify: Boolean): String
  }
}
