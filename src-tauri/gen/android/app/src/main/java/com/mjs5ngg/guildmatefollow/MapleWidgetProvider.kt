// 즐겨찾기 순위와 대표 캐릭터 주간 성장을 Android 홈 위젯으로 렌더링합니다.
package com.mjs5ngg.guildmatefollow

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

internal fun formatWidgetExp(value: Long?): String = when {
  value == null -> "자료 없음"
  abs(value) >= 1_000_000_000_000L -> String.format(Locale.KOREA, "%.1f조", value / 1_000_000_000_000.0)
  abs(value) >= 100_000_000L -> String.format(Locale.KOREA, "%.1f억", value / 100_000_000.0)
  abs(value) >= 10_000L -> String.format(Locale.KOREA, "%.1f만", value / 10_000.0)
  else -> String.format(Locale.KOREA, "%,d", value)
}

internal fun formatWidgetRate(value: Double?): String = value?.let {
  String.format(Locale.KOREA, "%.3f%%", it)
} ?: "—%"

internal fun formatWidgetGain(value: Long?): String = value?.let { "+${formatWidgetExp(it)}" } ?: "자료 없음"

internal fun JSONObject.optionalLong(key: String): Long? = if (isNull(key) || !has(key)) null else optLong(key)
internal fun JSONObject.optionalDouble(key: String): Double? = if (isNull(key) || !has(key)) null else optDouble(key)

internal fun avatarTargetSize(width: Int, height: Int, maximum: Int = 112): Pair<Int, Int> {
  if (width <= 0 || height <= 0) return maximum to maximum
  val scale = maximum.toDouble() / maxOf(width, height)
  return (width * scale).roundToInt().coerceAtLeast(1) to (height * scale).roundToInt().coerceAtLeast(1)
}

internal data class AvatarBounds(val left: Int, val top: Int, val right: Int, val bottom: Int)

internal fun avatarContentBounds(width: Int, height: Int, pixels: IntArray, padding: Int = 2): AvatarBounds? {
  if (width <= 0 || height <= 0 || pixels.size < width * height) return null
  var left = width
  var top = height
  var right = -1
  var bottom = -1
  pixels.forEachIndexed { index, pixel ->
    if ((pixel ushr 24) != 0) {
      val x = index % width
      val y = index / width
      left = minOf(left, x)
      top = minOf(top, y)
      right = maxOf(right, x)
      bottom = maxOf(bottom, y)
    }
  }
  if (right < left || bottom < top) return null
  return AvatarBounds(
    (left - padding).coerceAtLeast(0),
    (top - padding).coerceAtLeast(0),
    (right + padding).coerceAtMost(width - 1),
    (bottom + padding).coerceAtMost(height - 1),
  )
}

internal fun formatWidgetDay(date: String): String = date.takeIf { it.length >= 10 }
  ?.let { "${it.substring(5, 7)}.${it.substring(8, 10)}" }
  ?: "날짜 없음"

internal fun formatWeeklyGainSuffix(value: Long?, baseline: Boolean): String =
  if (baseline) "" else " (${formatWidgetGain(value)})"

internal fun formatWidgetUpdatedAt(value: String?): String? {
  if (value.isNullOrBlank()) return null
  Regex("(\\d{4}-\\d{2}-\\d{2})[T ](\\d{2}):(\\d{2})").find(value)?.let { match ->
    return "${match.groupValues[1]} ${match.groupValues[2]}:${match.groupValues[3]}"
  }
  Regex("(\\d{4}-\\d{2}-\\d{2})\\s+(오전|오후)\\s+(\\d{1,2}):(\\d{2})").find(value)?.let { match ->
    val hour = match.groupValues[3].toInt() % 12 + if (match.groupValues[2] == "오후") 12 else 0
    return "%s %02d:%s".format(Locale.KOREA, match.groupValues[1], hour, match.groupValues[4])
  }
  return null
}

internal fun estimatedLevelUpText(days: Long?): String {
  if (days == null || days < 0) return "예상 레벨업 · 계산 불가"
  val calendar = Calendar.getInstance().apply {
    add(Calendar.DAY_OF_YEAR, days.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
  }
  val date = SimpleDateFormat("MM월 dd일", Locale.KOREA).format(calendar.time)
  return "예상 레벨업 · $date (${days}일 후)"
}

internal fun buildFavoriteRow(context: Context, character: JSONObject, position: Int): RemoteViews =
  RemoteViews(context.packageName, R.layout.widget_favorite_ranking_row).apply {
    setTextViewText(R.id.favorite_rank, character.optInt("rank", position + 1).toString())
    setTextViewText(R.id.favorite_name, character.optString("character_name"))
    setViewVisibility(R.id.favorite_primary, if (character.optBoolean("is_primary")) View.VISIBLE else View.GONE)
    setTextViewText(R.id.favorite_detail, "Lv.${character.optLong("level")}  ·  ${formatWidgetRate(character.optionalDouble("current_exp_rate"))}")
    setTextViewText(R.id.favorite_gain, formatWidgetGain(character.optionalLong("today_exp")))
    MapleWidgetRenderer.setAvatar(context, this, R.id.favorite_avatar, character.optLong("character_id"))
  }

enum class WidgetKind { LARGE, WEEKLY, SQUARE, COMBINED }

abstract class MapleWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, id)) }
    if (kind == WidgetKind.LARGE && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      manager.notifyAppWidgetViewDataChanged(ids, R.id.favorite_list)
    }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, _options: Bundle) {
    manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, id))
  }
}

class FavoriteRankingWidgetProvider : MapleWidgetProvider(WidgetKind.LARGE)
class PrimaryWeeklyWidgetProvider : MapleWidgetProvider(WidgetKind.WEEKLY)
class PrimarySquareWidgetProvider : MapleWidgetProvider(WidgetKind.SQUARE)
class PrimaryCombinedWidgetProvider : MapleWidgetProvider(WidgetKind.COMBINED)

object MapleWidgetRenderer {
  const val PREFERENCES = "maple_home_widgets"
  const val SNAPSHOT_KEY = "favorite_snapshot"
  const val AVATAR_DIRECTORY = "widget_avatars"

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val providers = listOf(
      FavoriteRankingWidgetProvider::class.java to WidgetKind.LARGE,
      PrimaryWeeklyWidgetProvider::class.java to WidgetKind.WEEKLY,
      PrimarySquareWidgetProvider::class.java to WidgetKind.SQUARE,
      PrimaryCombinedWidgetProvider::class.java to WidgetKind.COMBINED,
    )
    providers.forEach { (provider, kind) ->
      val ids = manager.getAppWidgetIds(ComponentName(context, provider))
      ids.forEach { id -> manager.updateAppWidget(id, build(context, kind, id)) }
      if (kind == WidgetKind.LARGE && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        manager.notifyAppWidgetViewDataChanged(ids, R.id.favorite_list)
      }
    }
  }

  fun build(context: Context, kind: WidgetKind, widgetId: Int): RemoteViews {
    val snapshot = readSnapshot(context)
    val characters = snapshot?.optJSONArray("characters") ?: JSONArray()
    return when (kind) {
      WidgetKind.LARGE -> buildLarge(context, widgetId, snapshot)
      WidgetKind.WEEKLY -> buildWeekly(context, snapshot, characters)
      WidgetKind.SQUARE -> buildSquare(context, characters)
      WidgetKind.COMBINED -> buildCombined(context, snapshot, characters)
    }
  }

  fun readSnapshot(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(SNAPSHOT_KEY, null)
    return raw?.let { runCatching { JSONObject(it) }.getOrNull() }
  }

  fun setAvatar(context: Context, views: RemoteViews, viewId: Int, characterId: Long, maximum: Int = 112) {
    val file = File(File(context.filesDir, AVATAR_DIRECTORY), "$characterId.png")
    setAvatarFile(views, viewId, file, maximum)
  }

  private fun setStandingAvatar(context: Context, views: RemoteViews, characterId: Long) {
    val directory = File(context.filesDir, AVATAR_DIRECTORY)
    val fallback = File(directory, "$characterId.png")
    val frameIds = intArrayOf(
      R.id.primary_avatar_frame_0,
      R.id.primary_avatar_frame_1,
      R.id.primary_avatar_frame_2,
      R.id.primary_avatar_frame_3,
    )
    frameIds.forEachIndexed { index, viewId ->
      val frame = File(directory, "${characterId}_stand_$index.png")
      if (frame.isFile) setAvatarFile(views, viewId, frame, 160, cropTransparentPadding = false)
      else setAvatarFile(views, viewId, fallback, 160)
    }
  }

  private fun setAvatarFile(
    views: RemoteViews,
    viewId: Int,
    file: File,
    maximum: Int,
    cropTransparentPadding: Boolean = true,
  ) {
    val original = if (file.isFile) BitmapFactory.decodeFile(file.absolutePath) else null
    val bitmap = original?.let { source ->
      val cropped = if (cropTransparentPadding) {
        val pixels = IntArray(source.width * source.height)
        source.getPixels(pixels, 0, source.width, 0, 0, source.width, source.height)
        avatarContentBounds(source.width, source.height, pixels)?.let {
          Bitmap.createBitmap(source, it.left, it.top, it.right - it.left + 1, it.bottom - it.top + 1)
        } ?: source
      } else source
      if (cropped !== source) source.recycle()
      val (width, height) = avatarTargetSize(cropped.width, cropped.height, maximum)
      if (width == cropped.width && height == cropped.height) cropped
      else Bitmap.createScaledBitmap(cropped, width, height, false).also { cropped.recycle() }
    }
    if (bitmap != null) views.setImageViewBitmap(viewId, bitmap)
    else views.setImageViewResource(viewId, R.mipmap.ic_launcher)
  }

  fun openApp(context: Context, requestCode: Int): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(context, MainActivity::class.java)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun buildLarge(context: Context, widgetId: Int, snapshot: JSONObject?): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_favorite_ranking)
    val characters = snapshot?.optJSONArray("characters") ?: JSONArray()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val items = RemoteViews.RemoteCollectionItems.Builder()
        .setHasStableIds(true)
        .setViewTypeCount(1)
      for (position in 0 until characters.length()) {
        val character = characters.getJSONObject(position)
        items.addItem(character.optLong("character_id", position.toLong()), buildFavoriteRow(context, character, position))
      }
      views.setRemoteAdapter(R.id.favorite_list, items.build())
    } else {
      val serviceIntent = Intent(context, FavoriteRankingWidgetService::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      serviceIntent.data = Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME))
      views.setRemoteAdapter(R.id.favorite_list, serviceIntent)
    }
    views.setEmptyView(R.id.favorite_list, R.id.favorite_empty)
    views.setOnClickPendingIntent(R.id.favorite_header, openApp(context, 6200 + widgetId))
    views.setOnClickPendingIntent(R.id.favorite_refresh, openApp(context, 7200 + widgetId))
    val updated = formatWidgetUpdatedAt(snapshot?.takeUnless { it.isNull("updated_at") }?.optString("updated_at"))
    views.setTextViewText(R.id.favorite_updated, updated?.let { "$it 갱신" } ?: "앱에서 동기화해 주세요")
    return views
  }

  private fun buildWeekly(context: Context, snapshot: JSONObject?, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_primary_weekly)
    val primary = primaryCharacter(characters)
    val points = snapshot?.optJSONArray("primary_weekly_points") ?: JSONArray()
    val rowIds = intArrayOf(
      R.id.weekly_day_1,
      R.id.weekly_day_2,
      R.id.weekly_day_3,
      R.id.weekly_day_4,
      R.id.weekly_day_5,
      R.id.weekly_day_6,
      R.id.weekly_day_7,
    )
    if (primary == null) {
      views.setTextViewText(R.id.primary_name, "앱에서 동기화해 주세요")
    } else {
      views.setTextViewText(
        R.id.primary_name,
        "[${primary.optString("character_name")}] · ${primary.optString("character_class")}",
      )
    }
    rowIds.forEachIndexed { index, rowId ->
      val point = points.optJSONObject(index)
      views.setViewVisibility(rowId, if (point == null) View.GONE else View.VISIBLE)
      if (point != null) {
        val level = if (point.isNull("level")) "Lv.—" else "Lv.${point.optLong("level")}"
        val rate = formatWidgetRate(point.optionalDouble("exp_rate"))
        val gainSuffix = formatWeeklyGainSuffix(point.optionalLong("gained_exp"), index == 0)
        views.setTextViewText(
          rowId,
          "${formatWidgetDay(point.optString("date"))} · $level  $rate$gainSuffix",
        )
      }
    }
    views.setTextViewText(
      R.id.weekly_average,
      "일평균 ${formatWidgetExp(snapshot?.optionalLong("primary_daily_average_exp"))}  ·  남은 경험치 ${formatWidgetExp(snapshot?.optionalLong("primary_remaining_exp"))}",
    )
    views.setTextViewText(
      R.id.weekly_estimate,
      estimatedLevelUpText(snapshot?.optionalLong("primary_estimated_days")),
    )
    views.setOnClickPendingIntent(R.id.primary_widget_root, openApp(context, 6300))
    return views
  }

  private fun buildSquare(context: Context, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_primary_square)
    val primary = primaryCharacter(characters)
    if (primary == null) {
      views.setTextViewText(R.id.primary_name, "앱에서 동기화")
      views.setTextViewText(R.id.primary_rate, "—%")
      views.setTextViewText(R.id.primary_gain, "오늘 자료 없음")
    } else {
      views.setTextViewText(R.id.primary_name, primary.optString("character_name"))
      views.setTextViewText(R.id.primary_rate, formatWidgetRate(primary.optionalDouble("current_exp_rate")))
      views.setTextViewText(R.id.primary_gain, "오늘 ${formatWidgetGain(primary.optionalLong("today_exp"))}")
      setStandingAvatar(context, views, primary.optLong("character_id"))
    }
    views.setOnClickPendingIntent(R.id.primary_widget_root, openApp(context, 6400))
    return views
  }

  private fun buildCombined(context: Context, snapshot: JSONObject?, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_primary_combined)
    val primary = primaryCharacter(characters)
    val points = snapshot?.optJSONArray("primary_weekly_points") ?: JSONArray()
    val rowIds = intArrayOf(
      R.id.weekly_day_1,
      R.id.weekly_day_2,
      R.id.weekly_day_3,
      R.id.weekly_day_4,
      R.id.weekly_day_5,
      R.id.weekly_day_6,
      R.id.weekly_day_7,
    )
    if (primary == null) {
      views.setTextViewText(R.id.primary_name, "앱에서 동기화")
      views.setTextViewText(R.id.primary_rate, "—%")
      views.setTextViewText(R.id.primary_gain, "오늘 자료 없음")
    } else {
      views.setTextViewText(R.id.primary_name, primary.optString("character_name"))
      views.setTextViewText(R.id.primary_rate, formatWidgetRate(primary.optionalDouble("current_exp_rate")))
      views.setTextViewText(R.id.primary_gain, "오늘 ${formatWidgetGain(primary.optionalLong("today_exp"))}")
      setStandingAvatar(context, views, primary.optLong("character_id"))
    }
    rowIds.forEachIndexed { index, rowId ->
      val point = points.optJSONObject(index)
      views.setViewVisibility(rowId, if (point == null) View.GONE else View.VISIBLE)
      if (point != null) {
        val level = if (point.isNull("level")) "Lv.—" else "Lv.${point.optLong("level")}"
        views.setTextViewText(
          rowId,
          "${formatWidgetDay(point.optString("date"))} · $level  ${formatWidgetRate(point.optionalDouble("exp_rate"))}${formatWeeklyGainSuffix(point.optionalLong("gained_exp"), index == 0)}",
        )
      }
    }
    views.setTextViewText(
      R.id.weekly_average,
      "일평균 ${formatWidgetExp(snapshot?.optionalLong("primary_daily_average_exp"))}  ·  남은 경험치 ${formatWidgetExp(snapshot?.optionalLong("primary_remaining_exp"))}",
    )
    views.setTextViewText(R.id.weekly_estimate, estimatedLevelUpText(snapshot?.optionalLong("primary_estimated_days")))
    views.setOnClickPendingIntent(R.id.primary_widget_root, openApp(context, 6500))
    return views
  }

  private fun primaryCharacter(characters: JSONArray): JSONObject? = (0 until characters.length()).asSequence()
    .map { characters.getJSONObject(it) }
    .firstOrNull { it.optBoolean("is_primary") }

}
