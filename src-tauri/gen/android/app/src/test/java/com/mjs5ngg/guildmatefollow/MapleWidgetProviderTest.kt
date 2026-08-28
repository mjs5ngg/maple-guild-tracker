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
  fun widgetDayUsesKoreanMonthAndDay() {
    assertEquals("08월 27일", formatWidgetDay("2026-08-27"))
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
}
