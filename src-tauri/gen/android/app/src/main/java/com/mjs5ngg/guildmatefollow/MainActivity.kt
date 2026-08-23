// 길드원 따라가기 Android 앱의 기본 액티비티를 제공합니다.
package com.mjs5ngg.guildmatefollow

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import io.crates.keyring.Keyring

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = true
  private val issueHandler = Handler(Looper.getMainLooper())
  private var issueDialogVisible = false
  private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
  private val issueCheck = object : Runnable {
    override fun run() {
      showNotificationIssueIfNeeded()
      issueHandler.postDelayed(this, 5 * 60 * 1000L)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    Keyring.initializeNdkContext(applicationContext)
    super.onCreate(savedInstanceState)
    FavoriteNotificationMonitor.schedule(applicationContext)
    requestNotificationPermissionOnce()
  }

  override fun onResume() {
    super.onResume()
    val preferences = FavoriteNotificationMonitor.preferences(this)
    if (FavoriteNotificationMonitor.notificationsAllowed(this) &&
      preferences.getString(FavoriteNotificationMonitor.KEY_LAST_ERROR, "").orEmpty().contains("권한")) {
      FavoriteNotificationMonitor.runNow(applicationContext)
    }
    issueHandler.removeCallbacks(issueCheck)
    issueHandler.postDelayed(issueCheck, 2_000L)
  }

  override fun onPause() {
    issueHandler.removeCallbacks(issueCheck)
    super.onPause()
  }

  private fun requestNotificationPermissionOnce() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
    val preferences = FavoriteNotificationMonitor.preferences(this)
    if (preferences.getBoolean(FavoriteNotificationMonitor.KEY_PERMISSION_REQUESTED, false)) return
    preferences.edit()
      .putBoolean(FavoriteNotificationMonitor.KEY_PERMISSION_REQUESTED, true)
      .putLong(FavoriteNotificationMonitor.KEY_LAST_GUIDE_AT, System.currentTimeMillis())
      .apply()
    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
  }

  private fun showNotificationIssueIfNeeded() {
    if (issueDialogVisible) return
    val issue = FavoriteNotificationMonitor.currentIssue(this) ?: return
    val preferences = FavoriteNotificationMonitor.preferences(this)
    val now = System.currentTimeMillis()
    if (now - preferences.getLong(FavoriteNotificationMonitor.KEY_LAST_GUIDE_AT, 0L) < 30 * 60 * 1000L) return
    preferences.edit().putLong(FavoriteNotificationMonitor.KEY_LAST_GUIDE_AT, now).apply()
    issueDialogVisible = true
    AlertDialog.Builder(this)
      .setTitle("즐겨찾기 알림 확인 필요")
      .setMessage("$issue\n\n알림 권한과 배터리 사용 설정을 확인해 주세요.")
      .setPositiveButton("알림 설정 열기") { _, _ ->
        startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        })
      }
      .setNeutralButton("지금 다시 확인") { _, _ -> FavoriteNotificationMonitor.runNow(applicationContext) }
      .setNegativeButton("나중에") { _, _ -> }
      .setOnDismissListener { issueDialogVisible = false }
      .show()
  }
}
