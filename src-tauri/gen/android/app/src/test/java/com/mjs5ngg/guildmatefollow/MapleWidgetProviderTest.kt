// Android 홈 위젯의 이미지 크기와 경험치 표기 규칙을 검증합니다.
package com.mjs5ngg.guildmatefollow

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class MapleWidgetProviderTest {
  @Test
  fun avatarBitmapIsDownscaledWithoutChangingItsRatio() {
    assertEquals(48 to 96, avatarTargetSize(400, 800))
    assertEquals(64 to 64, avatarTargetSize(64, 64))
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
    listOf("widget_favorite_ranking.xml", "widget_primary_weekly.xml").forEach { name ->
      val layout = File("src/main/res/layout/$name").readText()
      assertFalse("$name must only use RemoteViews-supported classes", Regex("<View(?:\\s|>)").containsMatchIn(layout))
    }
  }
}
