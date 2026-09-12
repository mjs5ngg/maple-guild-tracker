// 공개 API 기록이 Android 홈 위젯 요약으로 정확히 변환되는지 검증합니다.
package com.mjs5ngg.guildmatefollow

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.io.File

class PublicWidgetSnapshotTest {
  private fun basic(name: String, exp: Long) = JSONObject()
    .put("character_name", name).put("character_class", "은월")
    .put("character_level", 200).put("character_exp", exp.toString())
    .put("character_exp_rate", exp / 100.0).put("character_image", "https://open.api.nexon.com/test.png")

  @Test
  fun favoritesAndSevenDayValuesComeFromPublicDashboard() {
    val today = LocalDate.now(ZoneId.of("Asia/Seoul"))
    val history = JSONArray()
    for (offset in 7L downTo 1L) history.put(JSONObject().put("date", today.minusDays(offset).toString()).put("basic", basic("대표", (7L - offset) * 100L)))
    val primary = JSONObject().put("ocid", "primary-ocid").put("basic", basic("대표", 700L))
      .put("observedAt", java.time.Instant.now().toString()).put("history", history)
      .put("todayBaseline", basic("대표", 600L))
    val favorite = JSONObject().put("ocid", "favorite-ocid").put("basic", basic("친구", 300L))
      .put("observedAt", java.time.Instant.now().toString()).put("history", JSONArray())
      .put("todayBaseline", basic("친구", 250L))
    val me = JSONObject().put("primary", "대표").put("favorites", JSONArray().put("친구"))
    val result = publicWidgetSnapshot(me, JSONObject().put("characters", JSONArray().put(primary).put(favorite)))
    assertEquals(2, result.getJSONArray("characters").length())
    val characters = result.getJSONArray("characters")
    assertTrue((0 until characters.length()).any { characters.getJSONObject(it).optBoolean("is_primary") })
    assertEquals(7, result.getJSONArray("primary_weekly_points").length())
    assertTrue(result.getJSONArray("primary_weekly_points").getJSONObject(0).isNull("gained_exp"))
  }

  @Test
  fun googleLoginUsesSystemBrowserPkceAndOneTimeDeepLink() {
    val activity = File("src/main/java/com/mjs5ngg/guildmatefollow/MainActivity.kt").readText()
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(activity.contains("Intent.ACTION_VIEW"))
    assertTrue(activity.contains("/auth/android/start"))
    assertTrue(activity.contains("/auth/android/exchange"))
    assertTrue(activity.contains("pkce_verifier"))
    assertTrue(manifest.contains("android:scheme=\"guildmatefollow\""))
  }
}
