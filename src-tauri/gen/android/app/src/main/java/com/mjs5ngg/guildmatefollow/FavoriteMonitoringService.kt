// 앱 화면 종료 후에도 즐겨찾기 경험치를 주기적으로 확인하는 전경 서비스입니다.
package com.mjs5ngg.guildmatefollow

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.coroutines.coroutineContext

class FavoriteMonitoringService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var monitorJob: Job? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    startForeground(NOTIFICATION_ID, monitoringNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    monitorJob?.cancel()
    monitorJob = scope.launch {
      val startedAt = System.currentTimeMillis()
      while (coroutineContext.isActive && System.currentTimeMillis() - startedAt < MAX_RUNTIME_MS) {
        if (!FavoriteNotificationMonitor.notificationsAllowed(applicationContext)) break
        FavoriteExpWorker.execute(applicationContext)
        delay(CHECK_INTERVAL_MS)
      }
      FavoriteNotificationMonitor.schedule(applicationContext)
      stopSelf()
    }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    monitorJob?.cancel()
    scope.cancel()
    super.onDestroy()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(
      MONITOR_CHANNEL_ID,
      "즐겨찾기 감시 상태",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "앱을 닫은 뒤에도 즐겨찾기 캐릭터의 경험치 증가를 확인합니다."
    })
  }

  private fun monitoringNotification() = NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
    .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
    .setContentTitle("즐겨찾기 알림 감시 중")
    .setContentText("앱을 닫아도 5분 간격으로 경험치 증가를 확인합니다.")
    .setContentIntent(PendingIntent.getActivity(
      this,
      NOTIFICATION_ID,
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    ))
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .build()

  companion object {
    private const val MONITOR_CHANNEL_ID = "favorite_exp_monitoring"
    private const val NOTIFICATION_ID = 2_081_508
    private const val CHECK_INTERVAL_MS = 5 * 60 * 1000L
    private const val MAX_RUNTIME_MS = 5 * 60 * 60 * 1000L + 45 * 60 * 1000L
  }
}
