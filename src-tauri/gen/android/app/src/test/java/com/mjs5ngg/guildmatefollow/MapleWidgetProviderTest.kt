// Android 홈 위젯의 행 수와 경험치 표기 규칙을 검증합니다.
package com.mjs5ngg.guildmatefollow

import org.junit.Assert.assertEquals
import org.junit.Test

class MapleWidgetProviderTest {
  @Test
  fun weeklyBarsUseAStableSevenDayScale() {
    assertEquals(listOf(2, 4, 10, 16, 22, 28, 34), weeklyBarHeights(listOf(null, 0, 2, 4, 6, 8, 10), 34))
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
}
