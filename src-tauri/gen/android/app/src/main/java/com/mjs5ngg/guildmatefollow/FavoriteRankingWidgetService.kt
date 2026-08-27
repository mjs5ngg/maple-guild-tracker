// 대형 위젯의 고정 높이 즐겨찾기 순위 행을 스크롤 컬렉션으로 제공합니다.
package com.mjs5ngg.guildmatefollow

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

class FavoriteRankingWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = FavoriteRankingFactory(applicationContext)
}

private class FavoriteRankingFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var characters = JSONArray()

  override fun onCreate() = reload()
  override fun onDataSetChanged() = reload()
  override fun onDestroy() = Unit
  override fun getCount(): Int = characters.length()
  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = characters.optJSONObject(position)?.optLong("character_id", position.toLong()) ?: position.toLong()
  override fun hasStableIds(): Boolean = true

  override fun getViewAt(position: Int): RemoteViews? {
    val character = characters.optJSONObject(position) ?: return null
    return buildFavoriteRow(context, character, position)
  }

  private fun reload() {
    characters = MapleWidgetRenderer.readSnapshot(context)?.optJSONArray("characters") ?: JSONArray()
  }
}
