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

internal fun standingAvatarUrl(imageUrl: String, frame: Int): String =
  "${imageUrl.substringBefore('?')}?action=A00.${frame.coerceIn(0, 3)}&width=128&height=128&x=64&y=90"

@TauriPlugin
class WidgetSnapshotPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun updateSnapshot(invoke: Invoke) {
    try {
      val snapshot = JSONObject(invoke.getRawArgs()).getJSONObject("snapshot")
      val context = activity.applicationContext
      WidgetSnapshotStore.save(context, snapshot)
      Thread {
        WidgetSnapshotStore.cacheImagesAndRefresh(context, snapshot)
      }.start()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("홈 위젯 데이터를 저장하지 못했습니다.", error)
    }
  }

}

object WidgetSnapshotStore {
  fun save(context: android.content.Context, snapshot: JSONObject) {
    context.getSharedPreferences(MapleWidgetRenderer.PREFERENCES, Activity.MODE_PRIVATE)
      .edit()
      .putString(MapleWidgetRenderer.SNAPSHOT_KEY, snapshot.toString())
      .apply()
    MapleWidgetRenderer.updateAll(context)
  }

  fun cacheImagesAndRefresh(context: android.content.Context, snapshot: JSONObject) {
    cacheAvatars(context, snapshot)
    MapleWidgetRenderer.updateAll(context)
  }

  private fun cacheAvatars(context: android.content.Context, snapshot: JSONObject) {
    val directory = File(context.filesDir, MapleWidgetRenderer.AVATAR_DIRECTORY).apply { mkdirs() }
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
      cacheAvatarFile(context, destination, urlKey, imageUrl)
      if (character.optBoolean("is_primary")) {
        repeat(4) { frame ->
          val standingFileName = "${id}_stand_$frame.png"
          activeFiles += standingFileName
          cacheAvatarFile(
            context,
            File(directory, standingFileName),
            "avatar_stand_url_${id}_$frame",
            standingAvatarUrl(imageUrl, frame),
          )
        }
      }
    }
    directory.listFiles()?.filter { it.name !in activeFiles }?.forEach { it.delete() }
  }

  private fun cacheAvatarFile(
    context: android.content.Context,
    destination: File,
    urlKey: String,
    imageUrl: String,
  ) {
    val preferences = context.getSharedPreferences(MapleWidgetRenderer.PREFERENCES, Activity.MODE_PRIVATE)
    if (destination.isFile && preferences.getString(urlKey, null) == imageUrl) return
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
}
