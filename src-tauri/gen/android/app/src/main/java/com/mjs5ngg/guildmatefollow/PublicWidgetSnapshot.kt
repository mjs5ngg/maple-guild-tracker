// 공개 API 응답을 Android 홈 위젯이 사용하는 요약 형식으로 변환합니다.
package com.mjs5ngg.guildmatefollow

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.ceil

private val requiredExperience = longArrayOf(
  2207026470L,2471869646L,2768494003L,3100713283L,3472798876L,3889534741L,4356278909L,4879032378L,5464516263L,6120258214L,
  7344309856L,8152183940L,9048924173L,10044305832L,11149179473L,13379015367L,14583126750L,15895608157L,17326212891L,18885572051L,
  22662686461L,24249074513L,25946509728L,27762765408L,29706158986L,35647390783L,38142708137L,40812697706L,43669586545L,46726457603L,
  56071749123L,57753901596L,59486518643L,61271114202L,63109247628L,75731097153L,78003030067L,80343120969L,82753414598L,85236017035L,
  102283220442L,105351717055L,108512268566L,111767636622L,115120665720L,138144798864L,142289142829L,146557817113L,150954551626L,155483188174L,
  186579825808L,192177220582L,197942537199L,203880813314L,209997237713L,216297154844L,222786069489L,229469651573L,236353741120L,243444353353L,
  1731919984062L,1749239183902L,1766731575741L,1784398891498L,1802242880412L,2342915744535L,2366344901980L,2390008350999L,2413908434508L,2438047518853L,
  5412465491853L,5466590146771L,5521256048238L,5576468608720L,5632233294807L,11377111255510L,12514822381061L,13766304619167L,15142935081083L,16657228589191L,
  33647601750165L,37012361925181L,40713598117699L,44784957929468L,49263453722414L,99512176519276L,109463394171203L,120409733588323L,132450706947155L,145695777641870L,
  294305470836577L,323736017920234L,356109619712257L,391720581683482L,430892639851830L,870403132500696L,957443445750765L,1053187790325841L,1158506569358425L,1737759854037637L,
)

private fun required(level: Int): Long? = requiredExperience.getOrNull(level - 200)

private fun gain(from: JSONObject?, to: JSONObject?): Long? {
  if (from == null || to == null) return null
  val fromLevel = from.optInt("character_level", -1)
  val toLevel = to.optInt("character_level", -1)
  val fromExp = from.optString("character_exp").toLongOrNull() ?: return null
  val toExp = to.optString("character_exp").toLongOrNull() ?: return null
  if (toLevel < fromLevel || fromExp < 0 || toExp < 0) return null
  if (toLevel == fromLevel) return (toExp - fromExp).takeIf { it >= 0 }
  var total = toExp - fromExp
  for (level in fromLevel until toLevel) total = Math.addExact(total, required(level) ?: return null)
  return total.takeIf { it >= 0 }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull(::optJSONObject)

internal fun publicWidgetSnapshot(me: JSONObject, dashboard: JSONObject): JSONObject {
  val primaryName = me.optString("primary")
  val favoriteValues = me.optJSONArray("favorites")
  val favorites = if (favoriteValues == null) emptySet() else (0 until favoriteValues.length()).map(favoriteValues::optString).toSet()
  val all = dashboard.optJSONArray("characters")?.objects().orEmpty()
  val included = all.filter { row ->
    val name = row.optJSONObject("basic")?.optString("character_name").orEmpty()
    name == primaryName || favorites.contains(name)
  }
  val today = LocalDate.now(ZoneId.of("Asia/Seoul"))
  fun history(row: JSONObject) = row.optJSONArray("history")?.objects().orEmpty().associateBy { it.optString("date") }
  fun currentFor(row: JSONObject, date: LocalDate): JSONObject? {
    if (date == today) {
      val observed = runCatching { Instant.parse(row.optString("observedAt")).atZone(ZoneId.of("Asia/Seoul")).toLocalDate() }.getOrNull()
      return row.optJSONObject("basic").takeIf { observed == today }
    }
    return history(row)[date.toString()]?.optJSONObject("basic")
  }
  fun dayGain(row: JSONObject, date: LocalDate): Long? {
    val to = currentFor(row, date) ?: return null
    val from = history(row)[date.minusDays(1).toString()]?.optJSONObject("basic")
      ?: row.optJSONObject("todayBaseline").takeIf { date == today }
    return gain(from, to)
  }
  val rows = included.sortedWith(compareByDescending<JSONObject> { dayGain(it, today) }
    .thenByDescending { it.optJSONObject("basic")?.optInt("character_level") ?: -1 }
    .thenByDescending { it.optJSONObject("basic")?.optString("character_exp")?.length ?: 0 }
    .thenByDescending { it.optJSONObject("basic")?.optString("character_exp") ?: "" }
    .thenBy { it.optJSONObject("basic")?.optString("character_name") ?: "" })
  val characters = JSONArray()
  rows.forEachIndexed { index, row ->
    val basic = row.getJSONObject("basic")
    val id = row.optString("ocid").hashCode().toLong() and 0xffffffffL
    characters.put(JSONObject()
      .put("character_id", id).put("rank", index + 1)
      .put("character_name", basic.optString("character_name"))
      .put("character_class", basic.optString("character_class"))
      .put("character_image", basic.optString("character_image"))
      .put("level", basic.optInt("character_level"))
      .put("current_exp_rate", basic.optDouble("character_exp_rate"))
      .put("today_exp", dayGain(row, today) ?: JSONObject.NULL)
      .put("is_primary", basic.optString("character_name") == primaryName))
  }
  val primary = rows.firstOrNull { it.optJSONObject("basic")?.optString("character_name") == primaryName }
  val points = JSONArray()
  val gains = mutableListOf<Long>()
  if (primary != null) for (offset in 6L downTo 0L) {
    val date = today.minusDays(offset)
    val basic = currentFor(primary, date)
    val value = if (offset == 6L) null else dayGain(primary, date)
    if (value != null) gains += value
    points.put(JSONObject().put("date", date.toString())
      .put("level", basic?.optInt("character_level") ?: JSONObject.NULL)
      .put("exp_rate", basic?.optDouble("character_exp_rate") ?: JSONObject.NULL)
      .put("gained_exp", value ?: JSONObject.NULL))
  }
  val primaryBasic = primary?.optJSONObject("basic")
  val remaining = primaryBasic?.let { basic -> required(basic.optInt("character_level"))?.minus(basic.optString("character_exp").toLongOrNull() ?: return@let null) }
  val average = gains.takeIf { it.size == 6 }?.sum()?.div(6)
  return JSONObject().put("updated_at", rows.maxOfOrNull { it.optString("observedAt") } ?: JSONObject.NULL)
    .put("characters", characters).put("primary_weekly_points", points)
    .put("primary_weekly_exp", gains.takeIf { it.isNotEmpty() }?.sum() ?: JSONObject.NULL)
    .put("primary_daily_average_exp", average ?: JSONObject.NULL)
    .put("primary_remaining_exp", remaining ?: JSONObject.NULL)
    .put("primary_estimated_days", if (remaining != null && average != null && average > 0) ceil(remaining.toDouble() / average).toLong() else JSONObject.NULL)
}
