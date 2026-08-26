// 즐겨찾기 순위와 대표 캐릭터 정보를 Android 홈 위젯으로 렌더링합니다.
package com.mjs5ngg.guildmatefollow

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

internal fun largeWidgetRowCount(heightDp: Int): Int = when {
  heightDp >= 360 -> 5
  heightDp >= 290 -> 4
  else -> 3
}

internal fun formatWidgetExp(value: Long?): String = when {
  value == null -> "자료 없음"
  kotlin.math.abs(value) >= 1_000_000_000_000L -> String.format(Locale.KOREA, "%.1f조", value / 1_000_000_000_000.0)
  kotlin.math.abs(value) >= 100_000_000L -> String.format(Locale.KOREA, "%.1f억", value / 100_000_000.0)
  kotlin.math.abs(value) >= 10_000L -> String.format(Locale.KOREA, "%.1f만", value / 10_000.0)
  else -> String.format(Locale.KOREA, "%,d", value)
}

internal fun formatWidgetRate(value: Double?): String = value?.let {
  String.format(Locale.KOREA, "%.3f%%", it)
} ?: "—%"

internal fun formatWidgetGain(value: Long?): String = value?.let { "+${formatWidgetExp(it)}" } ?: "자료 없음"

enum class WidgetKind { LARGE, COMPACT, SQUARE }

abstract class MapleWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, manager.getAppWidgetOptions(id))) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, options))
  }
}

class FavoriteRankingWidgetProvider : MapleWidgetProvider(WidgetKind.LARGE)
class PrimaryCompactWidgetProvider : MapleWidgetProvider(WidgetKind.COMPACT)
class PrimarySquareWidgetProvider : MapleWidgetProvider(WidgetKind.SQUARE)

object MapleWidgetRenderer {
  const val PREFERENCES = "maple_home_widgets"
  const val SNAPSHOT_KEY = "favorite_snapshot"
  const val AVATAR_DIRECTORY = "widget_avatars"

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    listOf(
      FavoriteRankingWidgetProvider::class.java,
      PrimaryCompactWidgetProvider::class.java,
      PrimarySquareWidgetProvider::class.java,
    ).forEach { provider ->
      manager.getAppWidgetIds(ComponentName(context, provider)).forEach { id ->
        val kind = when (provider) {
          FavoriteRankingWidgetProvider::class.java -> WidgetKind.LARGE
          PrimaryCompactWidgetProvider::class.java -> WidgetKind.COMPACT
          else -> WidgetKind.SQUARE
        }
        manager.updateAppWidget(id, build(context, kind, manager.getAppWidgetOptions(id)))
      }
    }
  }

  fun build(context: Context, kind: WidgetKind, options: Bundle): RemoteViews {
    val raw = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(SNAPSHOT_KEY, null)
    val snapshot = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
    val characters = snapshot?.optJSONArray("characters") ?: JSONArray()
    return when (kind) {
      WidgetKind.LARGE -> buildLarge(context, options, snapshot, characters)
      WidgetKind.COMPACT -> buildPrimary(context, R.layout.widget_primary_compact, characters)
      WidgetKind.SQUARE -> buildPrimary(context, R.layout.widget_primary_square, characters)
    }
  }

  private fun buildLarge(context: Context, options: Bundle, snapshot: JSONObject?, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_favorite_ranking)
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 300)
    val rowCount = largeWidgetRowCount(height)
    val containers = intArrayOf(R.id.favorite_row_1, R.id.favorite_row_2, R.id.favorite_row_3, R.id.favorite_row_4, R.id.favorite_row_5)
    val ranks = intArrayOf(R.id.favorite_rank_1, R.id.favorite_rank_2, R.id.favorite_rank_3, R.id.favorite_rank_4, R.id.favorite_rank_5)
    val avatars = intArrayOf(R.id.favorite_avatar_1, R.id.favorite_avatar_2, R.id.favorite_avatar_3, R.id.favorite_avatar_4, R.id.favorite_avatar_5)
    val names = intArrayOf(R.id.favorite_name_1, R.id.favorite_name_2, R.id.favorite_name_3, R.id.favorite_name_4, R.id.favorite_name_5)
    val details = intArrayOf(R.id.favorite_detail_1, R.id.favorite_detail_2, R.id.favorite_detail_3, R.id.favorite_detail_4, R.id.favorite_detail_5)
    val gains = intArrayOf(R.id.favorite_gain_1, R.id.favorite_gain_2, R.id.favorite_gain_3, R.id.favorite_gain_4, R.id.favorite_gain_5)
    for (index in containers.indices) {
      val visible = index < rowCount && index < characters.length()
      views.setViewVisibility(containers[index], if (visible) View.VISIBLE else View.GONE)
      if (!visible) continue
      val character = characters.getJSONObject(index)
      views.setTextViewText(ranks[index], character.optInt("rank", index + 1).toString())
      views.setTextViewText(names[index], character.optString("character_name") + if (character.optBoolean("is_primary")) "  대표" else "")
      views.setTextViewText(details[index], "Lv.${character.optLong("level")} · ${formatWidgetRate(character.optionalDouble("current_exp_rate"))}")
      views.setTextViewText(gains[index], formatWidgetGain(character.optionalLong("today_exp")))
      setAvatar(context, views, avatars[index], character.optLong("character_id"))
    }
    views.setViewVisibility(R.id.favorite_empty, if (characters.length() == 0) View.VISIBLE else View.GONE)
    val updated = snapshot?.optString("updated_at").orEmpty().replace('T', ' ').take(16)
    views.setTextViewText(R.id.favorite_updated, if (updated.isBlank()) "앱에서 동기화해 주세요" else "$updated 갱신")
    views.setOnClickPendingIntent(R.id.favorite_widget_root, openApp(context, 6100))
    return views
  }

  private fun buildPrimary(context: Context, layout: Int, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, layout)
    val primary = (0 until characters.length()).asSequence()
      .map { characters.getJSONObject(it) }
      .firstOrNull { it.optBoolean("is_primary") }
    if (primary == null) {
      views.setTextViewText(R.id.primary_name, "앱에서 동기화")
      views.setTextViewText(R.id.primary_rate, "—%")
      views.setTextViewText(R.id.primary_gain, "오늘 자료 없음")
    } else {
      views.setTextViewText(R.id.primary_name, primary.optString("character_name"))
      views.setTextViewText(R.id.primary_rate, formatWidgetRate(primary.optionalDouble("current_exp_rate")))
      views.setTextViewText(R.id.primary_gain, "오늘 ${formatWidgetGain(primary.optionalLong("today_exp"))}")
      setAvatar(context, views, R.id.primary_avatar, primary.optLong("character_id"))
    }
    views.setOnClickPendingIntent(R.id.primary_widget_root, openApp(context, layout))
    return views
  }

  private fun setAvatar(context: Context, views: RemoteViews, viewId: Int, characterId: Long) {
    val file = File(File(context.filesDir, AVATAR_DIRECTORY), "$characterId.png")
    val bitmap = if (file.isFile) BitmapFactory.decodeFile(file.absolutePath) else null
    if (bitmap != null) views.setImageViewBitmap(viewId, bitmap)
    else views.setImageViewResource(viewId, R.mipmap.ic_launcher)
  }

  private fun openApp(context: Context, requestCode: Int): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(context, MainActivity::class.java)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun JSONObject.optionalLong(key: String): Long? = if (isNull(key) || !has(key)) null else optLong(key)
  private fun JSONObject.optionalDouble(key: String): Double? = if (isNull(key) || !has(key)) null else optDouble(key)
}
