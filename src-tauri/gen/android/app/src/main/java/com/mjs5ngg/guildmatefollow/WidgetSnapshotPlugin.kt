// Rust가 계산한 즐겨찾기 데이터를 홈 위젯 저장소와 이미지 캐시에 반영합니다.
package com.mjs5ngg.guildmatefollow

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@TauriPlugin
class WidgetSnapshotPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun updateSnapshot(invoke: Invoke) {
    try {
      val snapshot = JSONObject(invoke.getRawArgs()).getJSONObject("snapshot")
      val context = activity.applicationContext
      context.getSharedPreferences(MapleWidgetRenderer.PREFERENCES, Activity.MODE_PRIVATE)
        .edit()
        .putString(MapleWidgetRenderer.SNAPSHOT_KEY, snapshot.toString())
        .apply()
      MapleWidgetRenderer.updateAll(context)
      Thread {
        cacheAvatars(context.filesDir, snapshot)
        MapleWidgetRenderer.updateAll(context)
      }.start()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("홈 위젯 데이터를 저장하지 못했습니다.", error)
    }
  }

  private fun cacheAvatars(filesDir: File, snapshot: JSONObject) {
    val preferences = activity.applicationContext.getSharedPreferences(MapleWidgetRenderer.PREFERENCES, Activity.MODE_PRIVATE)
    val directory = File(filesDir, MapleWidgetRenderer.AVATAR_DIRECTORY).apply { mkdirs() }
    val activeFiles = mutableSetOf<String>()
    val characters = snapshot.optJSONArray("characters") ?: return
    for (index in 0 until characters.length()) {
      val character = characters.optJSONObject(index) ?: continue
      val id = character.optLong("character_id", -1L)
      val imageUrl = character.optString("character_image")
      if (id < 0 || !imageUrl.startsWith("https://")) continue
      val fileName = "$id.png"
      activeFiles += fileName
      val destination = File(directory, fileName)
      val urlKey = "avatar_url_$id"
      if (destination.isFile && preferences.getString(urlKey, null) == imageUrl) continue
      try {
        val connection = URL(imageUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 8_000
        connection.readTimeout = 8_000
        connection.instanceFollowRedirects = true
        connection.inputStream.use { input -> destination.outputStream().use(input::copyTo) }
        connection.disconnect()
        preferences.edit().putString(urlKey, imageUrl).apply()
      } catch (_: Exception) {
        // 기존 캐시가 있으면 유지하고 다음 동기화에서 다시 시도합니다.
      }
    }
    directory.listFiles()?.filter { it.name !in activeFiles }?.forEach { it.delete() }
  }
}
