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
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
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

internal fun weeklyBarHeights(values: List<Long?>, maxHeight: Int): List<Int> {
  val ceiling = values.filterNotNull().maxOrNull()?.coerceAtLeast(1L) ?: 1L
  return values.map { value ->
    if (value == null) 2 else (4 + value.coerceAtLeast(0L).toDouble() / ceiling * (maxHeight - 4)).roundToInt()
  }
}

internal fun buildFavoriteRow(context: Context, character: JSONObject, position: Int): RemoteViews =
  RemoteViews(context.packageName, R.layout.widget_favorite_ranking_row).apply {
    setTextViewText(R.id.favorite_rank, character.optInt("rank", position + 1).toString())
    setTextViewText(R.id.favorite_name, character.optString("character_name"))
    setTextViewText(R.id.favorite_primary, if (character.optBoolean("is_primary")) "대표" else "")
    setViewVisibility(R.id.favorite_primary, if (character.optBoolean("is_primary")) View.VISIBLE else View.GONE)
    setTextViewText(R.id.favorite_detail, "Lv.${character.optLong("level")}  ·  ${formatWidgetRate(character.optionalDouble("current_exp_rate"))}")
    setTextViewText(R.id.favorite_gain, formatWidgetGain(character.optionalLong("today_exp")))
    MapleWidgetRenderer.setAvatar(context, this, R.id.favorite_avatar, character.optLong("character_id"))
  }

enum class WidgetKind { LARGE, WEEKLY, SQUARE }

abstract class MapleWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, id, manager.getAppWidgetOptions(id))) }
    if (kind == WidgetKind.LARGE && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      manager.notifyAppWidgetViewDataChanged(ids, R.id.favorite_list)
    }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, MapleWidgetRenderer.build(context, kind, id, options))
  }
}

class FavoriteRankingWidgetProvider : MapleWidgetProvider(WidgetKind.LARGE)
class PrimaryWeeklyWidgetProvider : MapleWidgetProvider(WidgetKind.WEEKLY)
class PrimarySquareWidgetProvider : MapleWidgetProvider(WidgetKind.SQUARE)

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
    )
    providers.forEach { (provider, kind) ->
      val ids = manager.getAppWidgetIds(ComponentName(context, provider))
      ids.forEach { id -> manager.updateAppWidget(id, build(context, kind, id, manager.getAppWidgetOptions(id))) }
      if (kind == WidgetKind.LARGE && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        manager.notifyAppWidgetViewDataChanged(ids, R.id.favorite_list)
      }
    }
  }

  fun build(context: Context, kind: WidgetKind, widgetId: Int, options: Bundle): RemoteViews {
    val snapshot = readSnapshot(context)
    val characters = snapshot?.optJSONArray("characters") ?: JSONArray()
    return when (kind) {
      WidgetKind.LARGE -> buildLarge(context, widgetId, snapshot)
      WidgetKind.WEEKLY -> buildWeekly(context, options, snapshot, characters)
      WidgetKind.SQUARE -> buildSquare(context, characters)
    }
  }

  fun readSnapshot(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(SNAPSHOT_KEY, null)
    return raw?.let { runCatching { JSONObject(it) }.getOrNull() }
  }

  fun setAvatar(context: Context, views: RemoteViews, viewId: Int, characterId: Long) {
    val file = File(File(context.filesDir, AVATAR_DIRECTORY), "$characterId.png")
    val bitmap = if (file.isFile) BitmapFactory.decodeFile(file.absolutePath) else null
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
    views.setTextViewText(R.id.favorite_count, "${characters.length()}명")
    val updated = snapshot?.takeUnless { it.isNull("updated_at") }?.optString("updated_at").orEmpty().replace('T', ' ').take(16)
    views.setTextViewText(R.id.favorite_updated, if (updated.isBlank()) "앱에서 동기화해 주세요" else "$updated 갱신")
    return views
  }

  private fun buildWeekly(context: Context, options: Bundle, snapshot: JSONObject?, characters: JSONArray): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_primary_weekly)
    val primary = primaryCharacter(characters)
    val weeklyExp = snapshot?.optionalLong("primary_weekly_exp")
    val points = snapshot?.optJSONArray("primary_weekly_points")?.let { array ->
      (0 until array.length()).map { index -> if (array.isNull(index)) null else array.optLong(index) }
    } ?: List(7) { null }
    if (primary == null) {
      views.setTextViewText(R.id.primary_name, "앱에서 동기화")
      views.setTextViewText(R.id.primary_rate, "—%")
      views.setTextViewText(R.id.primary_gain, "7일 자료 없음")
    } else {
      views.setTextViewText(R.id.primary_name, primary.optString("character_name"))
      views.setTextViewText(R.id.primary_rate, formatWidgetRate(primary.optionalDouble("current_exp_rate")))
      views.setTextViewText(R.id.primary_gain, "7일 ${formatWidgetGain(weeklyExp)}")
      setAvatar(context, views, R.id.primary_avatar, primary.optLong("character_id"))
    }
    val widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180)
    val density = context.resources.displayMetrics.density
    val chartWidth = ((widthDp - 102).coerceAtLeast(68) * density).roundToInt()
    views.setImageViewBitmap(R.id.primary_weekly_chart, weeklyChart(points, chartWidth, (43 * density).roundToInt()))
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
      setAvatar(context, views, R.id.primary_avatar, primary.optLong("character_id"))
    }
    views.setOnClickPendingIntent(R.id.primary_widget_root, openApp(context, 6400))
    return views
  }

  private fun primaryCharacter(characters: JSONArray): JSONObject? = (0 until characters.length()).asSequence()
    .map { characters.getJSONObject(it) }
    .firstOrNull { it.optBoolean("is_primary") }

  private fun weeklyChart(values: List<Long?>, width: Int, height: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val heights = weeklyBarHeights(values, height - 5)
    val slot = width / 7f
    val barWidth = (slot * 0.52f).coerceAtLeast(3f)
    val active = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(255, 132, 73) }
    val muted = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(54, 63, 76) }
    heights.forEachIndexed { index, barHeight ->
      val left = index * slot + (slot - barWidth) / 2f
      val top = height - barHeight.toFloat()
      canvas.drawRoundRect(left, top, left + barWidth, height.toFloat(), barWidth / 2f, barWidth / 2f, if (values[index] == null) muted else active)
    }
    return bitmap
  }
}
