// Android 홈 위젯의 행 수와 경험치 표기 규칙을 검증합니다.
package com.mjs5ngg.guildmatefollow

import org.junit.Assert.assertEquals
import org.junit.Test

class MapleWidgetProviderTest {
  @Test
  fun largeWidgetRowsFollowAvailableHeight() {
    assertEquals(3, largeWidgetRowCount(250))
    assertEquals(4, largeWidgetRowCount(290))
    assertEquals(5, largeWidgetRowCount(360))
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
