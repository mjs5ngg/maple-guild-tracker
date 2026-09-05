// Android 홈 위젯의 이미지 크기와 경험치 표기 규칙을 검증합니다.
package com.mjs5ngg.guildmatefollow

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MapleWidgetProviderTest {
  @Test
  fun avatarBitmapIsScaledToItsTargetWithoutChangingItsRatio() {
    assertEquals(56 to 112, avatarTargetSize(400, 800))
    assertEquals(112 to 112, avatarTargetSize(64, 64))
    assertEquals(128 to 256, avatarTargetSize(40, 80, 256))
  }

  @Test
  fun avatarTransparentPaddingIsExcludedFromItsContentBounds() {
    val pixels = IntArray(25)
    pixels[2 * 5 + 2] = -1
    assertEquals(AvatarBounds(1, 1, 3, 3), avatarContentBounds(5, 5, pixels, padding = 1))
    assertEquals(null, avatarContentBounds(5, 5, IntArray(25), padding = 1))
  }

  @Test
  fun standingFramesShareOneContentBounds() {
    val first = IntArray(25).also { it[1 * 5 + 1] = -1 }
    val last = IntArray(25).also { it[3 * 5 + 3] = -1 }
    assertEquals(
      AvatarBounds(0, 0, 4, 4),
      combinedAvatarContentBounds(5, 5, listOf(first, last), padding = 1),
    )
  }

  @Test
  fun widgetDayUsesCompactMonthAndDay() {
    assertEquals("08.27", formatWidgetDay("2026-08-27"))
  }

  @Test
  fun firstWeeklyPointDoesNotRenderAGainSuffix() {
    assertEquals("", formatWeeklyGainSuffix(100L, baseline = true))
    assertEquals(" (+100)", formatWeeklyGainSuffix(100L, baseline = false))
  }

  @Test
  fun widgetUpdatedTimeAlwaysUsesTwentyFourHourFormat() {
    assertEquals("2026-08-28 21:05", formatWidgetUpdatedAt("2026-08-28T21:05:11+09:00"))
    assertEquals("2026-08-28 00:05", formatWidgetUpdatedAt("2026-08-28 오전 12:05"))
    assertEquals("2026-08-28 13:05", formatWidgetUpdatedAt("2026-08-28 오후 1:05"))
    assertEquals(null, formatWidgetUpdatedAt(null))
    assertEquals("2026-08-29 01:05", formatWidgetUpdatedAt("2026-08-28 16:05:11"))
    assertEquals("2026-08-29 01:05", formatWidgetUpdatedAt("2026-08-28T16:05:11.123Z"))
    assertEquals(null, formatWidgetUpdatedAt("2026-99-99 30:05:00"))
  }

  @Test
  fun standingAvatarUrlUsesFourOfficialIdleFrames() {
    val image = "https://open.api.nexon.com/static/maplestory/character/look/abc.png?width=96"
    assertEquals(
      "https://open.api.nexon.com/static/maplestory/character/look/abc.png?action=A00.0&width=128&height=128&x=64&y=90",
      standingAvatarUrl(image, 0),
    )
    assertTrue((0..3).all { standingAvatarUrl(image, it).contains("action=A00.$it") })
  }

  @Test
  fun experienceUsesKoreanUnitsAndMissingState() {
    assertEquals("2.2조", formatWidgetExp(2_200_000_000_000L))
    assertEquals("3.5억", formatWidgetExp(350_000_000L))
    assertEquals("+1.2만", formatWidgetGain(12_000L))
    assertEquals("자료 없음", formatWidgetGain(null))
  }

  @Test
  fun rateKeepsThreeDecimalPlaces() {
    assertEquals("30.123%", formatWidgetRate(30.1234))
    assertEquals("—%", formatWidgetRate(null))
  }

  @Test
  fun compactRankingValuesDropDecimalPlaces() {
    assertEquals("12%", formatCompactWidgetRate(12.345))
    assertEquals("+12조", formatCompactWidgetGain(12_300_000_000_000L))
    assertEquals("+0", formatCompactWidgetGain(0L))
  }

  @Test
  fun remoteWidgetLayoutsDoNotUseUnsupportedPlainViews() {
    listOf("widget_favorite_ranking.xml", "widget_primary_weekly.xml", "widget_primary_combined.xml").forEach { name ->
      val layout = File("src/main/res/layout/$name").readText()
      assertFalse("$name must only use RemoteViews-supported classes", Regex("<View(?:\\s|>)").containsMatchIn(layout))
    }
  }

  @Test
  fun combinedWidgetIsRegisteredAsFiveByTwo() {
    val manifest = File("src/main/AndroidManifest.xml").readText()
    val provider = File("src/main/res/xml/widget_primary_combined_info.xml").readText()
    assertTrue(manifest.contains(".PrimaryCombinedWidgetProvider"))
    assertTrue(provider.contains("android:targetCellWidth=\"5\""))
    assertTrue(provider.contains("android:targetCellHeight=\"2\""))
  }

  @Test
  fun largeWidgetCanShrinkToThreeByThree() {
    val provider = File("src/main/res/xml/widget_favorite_ranking_info.xml").readText()
    assertTrue(provider.contains("android:minResizeWidth=\"180dp\""))
    assertTrue(provider.contains("android:minResizeHeight=\"180dp\""))
  }

  @Test
  fun representativeWidgetsUseFourFrameIdleAnimation() {
    listOf("widget_primary_square.xml", "widget_primary_combined.xml").forEach { name ->
      val layout = File("src/main/res/layout/$name").readText()
      assertTrue(layout.contains("<ViewFlipper"))
      assertTrue(layout.contains("android:autoStart=\"true\""))
      assertTrue((0..3).all { layout.contains("primary_avatar_frame_$it") })
    }
  }

  @Test
  fun widgetNicknamesUseSingleLineAutoSizing() {
    listOf(
      "widget_favorite_ranking_row.xml",
      "widget_primary_square.xml",
      "widget_primary_combined.xml",
      "widget_primary_weekly.xml",
    ).forEach { name ->
      val layout = File("src/main/res/layout/$name").readText()
      val nicknameId = if (name == "widget_favorite_ranking_row.xml") "favorite_name" else "primary_name"
      val nickname = Regex("<TextView[^>]*android:id=\"@\\+id/$nicknameId\"[^>]*/>").find(layout)?.value.orEmpty()
      assertTrue("$name must auto-size its nickname", nickname.contains("android:autoSizeTextType=\"uniform\""))
      assertFalse("$name must not ellipsize its nickname", nickname.contains("android:ellipsize=\"end\""))
    }
  }

  @Test
  fun widgetActionsAndPrimaryMarkersUseVectorIcons() {
    val ranking = File("src/main/res/layout/widget_favorite_ranking.xml").readText()
    val row = File("src/main/res/layout/widget_favorite_ranking_row.xml").readText()
    val square = File("src/main/res/layout/widget_primary_square.xml").readText()
    val combined = File("src/main/res/layout/widget_primary_combined.xml").readText()
    assertTrue(ranking.contains("android:src=\"@drawable/maple_widget_refresh\""))
    assertFalse(ranking.contains("android:text=\"↻\""))
    listOf(row, square, combined).forEach { layout ->
      assertTrue(layout.contains("android:src=\"@drawable/maple_widget_crown\""))
      assertFalse(layout.contains("android:text=\"대표캐릭터\""))
    }
    assertTrue(row.indexOf("@+id/favorite_primary") < row.indexOf("@+id/favorite_name"))
    assertTrue(Regex("android:id=\"@\\+id/primary_name\"[^>]*android:gravity=\"start\"").containsMatchIn(square))
  }

  @Test
  fun textOnlyWeeklyWidgetHasComfortableVerticalPadding() {
    val weekly = File("src/main/res/layout/widget_primary_weekly.xml").readText()
    assertTrue(weekly.contains("android:paddingTop=\"7dp\""))
    assertTrue(weekly.contains("android:paddingBottom=\"7dp\""))
  }

  @Test
  fun smallWidgetTextIsAtLeastTwelveExceptUpdatedTime() {
    val layouts = File("src/main/res/layout").listFiles().orEmpty().filter { it.name.startsWith("widget_") }
    layouts.forEach { file ->
      Regex("android:textSize=\"(\\d+)sp\"").findAll(file.readText()).forEach { match ->
        val size = match.groupValues[1].toInt()
        val isUpdatedTime = file.name == "widget_favorite_ranking.xml" && size == 8
        assertTrue("${file.name} contains an unexpected ${size}sp font", isUpdatedTime || size >= 12)
      }
    }
  }

  @Test
  fun largeWidgetHasCompactRankNumbersAndManualRefresh() {
    val styles = File("src/main/res/values/widget_styles.xml").readText()
    val layout = File("src/main/res/layout/widget_favorite_ranking.xml").readText()
    assertTrue(styles.contains("name=\"MapleWidgetRankNumber\""))
    assertTrue(styles.contains("android:layout_width\">14dp"))
    assertTrue(styles.contains("android:layout_height\">22dp"))
    assertFalse(styles.contains("@drawable/maple_widget_rank_background"))
    assertTrue(layout.contains("android:id=\"@+id/favorite_refresh\""))
  }

  @Test
  fun widgetLabelsAndAvatarPanelsUseTheSimplifiedDesign() {
    val ranking = File("src/main/res/layout/widget_favorite_ranking.xml").readText()
    val square = File("src/main/res/layout/widget_primary_square.xml").readText()
    val combined = File("src/main/res/layout/widget_primary_combined.xml").readText()
    assertFalse(ranking.contains("favorite_count"))
    assertFalse(square.contains("PRIMARY"))
    assertFalse(combined.contains("PRIMARY"))
    assertFalse(square.contains("maple_widget_avatar_panel"))
    assertFalse(combined.contains("maple_widget_avatar_panel"))
  }

  @Test
  fun requestedFontSizeExceptionsRemainUnchanged() {
    val ranking = File("src/main/res/layout/widget_favorite_ranking.xml").readText()
    val square = File("src/main/res/layout/widget_primary_square.xml").readText()
    assertTrue(Regex("android:text=\"즐겨찾기 랭킹\"[^>]*android:textSize=\"17sp\"").containsMatchIn(ranking))
    assertTrue(Regex("android:id=\"@\\+id/primary_rate\"[^>]*android:textSize=\"18sp\"").containsMatchIn(square))
  }

  @Test
  fun widgetBackgroundSyncUsesPersistentFifteenMinuteWork() {
    val worker = File("src/main/java/com/mjs5ngg/guildmatefollow/WidgetSyncWorker.kt").readText()
    val gradle = File("build.gradle.kts").readText()
    val proguard = File("widget.pro").readText()
    assertTrue(worker.contains("PeriodicWorkRequestBuilder<WidgetSyncWorker>(15, TimeUnit.MINUTES)"))
    assertTrue(worker.contains("NetworkType.CONNECTED"))
    assertTrue(worker.contains("ExistingPeriodicWorkPolicy.KEEP"))
    assertTrue(worker.contains("syncAndBuildSnapshot"))
    assertTrue(gradle.contains("androidx.work:work-runtime-ktx"))
    assertTrue(proguard.contains("WidgetSyncWorker"))
  }
}
