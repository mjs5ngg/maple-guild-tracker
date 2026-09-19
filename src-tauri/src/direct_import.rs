// 앱 화면(웹 직접 조회)의 결과를 네이티브 SQLite에 저장하고 위젯 스냅샷을 만듭니다.
use std::path::Path;

use serde::{Deserialize, Deserializer};

use crate::models::{CharacterBasic, Snapshot};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectHistory {
    date: String,
    basic: DirectHistoryBasic,
}

#[derive(Deserialize)]
struct DirectHistoryBasic {
    #[serde(default, deserialize_with = "optional_integer")]
    character_level: Option<i64>,
    #[serde(default, deserialize_with = "optional_integer")]
    character_exp: Option<i64>,
    #[serde(default)]
    character_exp_rate: Option<String>,
    #[serde(default)]
    access_flag: Option<String>,
}

#[derive(Deserialize)]
struct DirectBasic {
    #[serde(default)]
    date: Option<String>,
    character_name: String,
    world_name: String,
    character_class: String,
    #[serde(default, deserialize_with = "optional_integer")]
    character_level: Option<i64>,
    #[serde(default, deserialize_with = "optional_integer")]
    character_exp: Option<i64>,
    #[serde(default)]
    character_exp_rate: Option<String>,
    #[serde(default)]
    character_guild_name: Option<String>,
    #[serde(default)]
    character_image: Option<String>,
    #[serde(default)]
    access_flag: Option<String>,
}

impl DirectBasic {
    fn as_character_basic(&self) -> CharacterBasic {
        CharacterBasic {
            date: self.date.clone(),
            character_name: self.character_name.clone(),
            world_name: self.world_name.clone(),
            character_class: self.character_class.clone(),
            character_level: self.character_level.unwrap_or_default(),
            character_exp: self.character_exp.unwrap_or_default(),
            character_exp_rate: self.character_exp_rate.clone().unwrap_or_default(),
            character_guild_name: self.character_guild_name.clone(),
            character_image: self.character_image.clone(),
            access_flag: self.access_flag.clone(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectRow {
    ocid: String,
    basic: DirectBasic,
    observed_at: String,
    #[serde(default)]
    history: Vec<DirectHistory>,
    #[serde(default)]
    is_guild_member: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectImport {
    primary: String,
    favorites: Vec<String>,
    guild_key: String,
    rows: Vec<DirectRow>,
}

// 오래 접속하지 않은 캐릭터 등은 NEXON이 값을 비워 보내므로 null도 받아 두고 저장 단계에서 건너뜁니다.
fn optional_integer<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    // 해석할 수 없는 값은 오류로 전체를 버리지 않고 빈 값으로 보고, 해당 캐릭터·날짜만 건너뜁니다.
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::Number(value) => value
            .as_i64()
            .or_else(|| value.as_f64().filter(|number| number.is_finite()).map(|number| number.round() as i64)),
        serde_json::Value::String(value) => {
            let trimmed = value.trim().replace(',', "");
            trimmed.parse::<i64>().ok().or_else(|| {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|number| number.is_finite())
                    .map(|number| number.round() as i64)
            })
        }
        _ => None,
    })
}


// 가져온 뒤 위젯에 바로 쓸 스냅샷을 돌려줍니다.
pub(crate) fn import(path: &Path, payload: &str) -> Result<crate::models::MobileWidgetSnapshot, crate::AppError> {
    let mut input: DirectImport = serde_json::from_str(payload).map_err(|error| {
        eprintln!("GuildWidget import payload: {error}");
        error
    })?;
    // 브라우저 저장소의 일별 기록은 계속 쌓이므로 거부하지 않고 최신 31일만 씁니다.
    // 값이 비어 있는 캐릭터·날짜는 한 명 때문에 전체가 실패하지 않도록 건너뜁니다.
    input.rows.retain(|row| {
        row.basic.character_level.is_some()
            && row.basic.character_exp.is_some()
            && row.basic.character_exp_rate.is_some()
    });
    for row in &mut input.rows {
        row.history.retain(|point| {
            point.basic.character_level.is_some()
                && point.basic.character_exp.is_some()
                && point.basic.character_exp_rate.is_some()
        });
        row.history.sort_by(|left, right| left.date.cmp(&right.date));
        let excess = row.history.len().saturating_sub(31);
        row.history.drain(..excess);
    }
    if input.primary.is_empty()
        || input.primary.chars().count() > 20
        || input.favorites.len() > 30
        || input.rows.len() > 1000
    {
        return Err(crate::AppError::Validation(
            "Android 직접 조회 결과의 범위를 확인해 주세요.".into(),
        ));
    }
    let mut connection = crate::db::open(path)?;
    crate::db::migrate(&connection)?;
    // 중간에 실패해도 반쯤 쓴 상태가 남지 않도록 캐릭터·기록 저장을 한 번에 처리합니다.
    let transaction = connection.transaction()?;
    let connection_ref: &rusqlite::Connection = &transaction;
    let primary = input
        .rows
        .iter()
        .find(|row| row.basic.character_name == input.primary)
        .ok_or_else(|| crate::AppError::Validation("대표 캐릭터 결과가 없습니다.".into()))?;
    let guild_name = primary
        .basic
        .character_guild_name
        .clone()
        .unwrap_or_default();
    // 길드가 없는 대표도 위젯 작업이 쓸 수 있도록 대표 설정은 항상 저장합니다.
    let primary_basic = primary.basic.as_character_basic();
    let has_guild = !guild_name.is_empty() && !input.guild_key.is_empty();
    crate::db::save_setup(
        connection_ref,
        &primary_basic,
        &primary.ocid,
        if has_guild { &guild_name } else { "" },
        if has_guild { &input.guild_key } else { "" },
    )?;
    if !has_guild {
        crate::db::delete_setting(connection_ref, "oguild_id")?;
        crate::db::delete_setting(connection_ref, "guild_name")?;
    }
    connection_ref.execute("UPDATE characters SET is_favorite=is_primary", [])?;
    let favorite_names: std::collections::HashSet<&str> =
        input.favorites.iter().map(String::as_str).collect();
    for row in &input.rows {
        let favorite = row.basic.character_name == input.primary
            || favorite_names.contains(row.basic.character_name.as_str());
        let character = crate::db::upsert_character(
            connection_ref,
            &row.basic.character_name,
            &row.basic.world_name,
            &row.basic.character_class,
            row.basic.character_image.as_deref(),
            &row.ocid,
            favorite,
        )?;
        let observed_at = chrono::DateTime::parse_from_rfc3339(&row.observed_at)
            .map(|value| {
                value
                    .with_timezone(&chrono::Utc)
                    .format("%Y-%m-%d %H:%M:%S%.6f")
                    .to_string()
            })
            .unwrap_or_else(|_| row.observed_at.clone());
        crate::db::save_live_snapshot_at(
            connection_ref,
            &Snapshot {
                character_id: character.id,
                date: String::new(),
                level: row.basic.character_level.unwrap_or_default(),
                exp: row.basic.character_exp.unwrap_or_default(),
                exp_rate: row.basic.character_exp_rate.clone().unwrap_or_default(),
                access_flag: row.basic.access_flag.clone(),
                raw_json: serde_json::to_string(&row.basic.as_character_basic())?,
            },
            &observed_at,
        )?;
        for history in &row.history {
            crate::db::save_snapshot(
                connection_ref,
                &Snapshot {
                    character_id: character.id,
                    date: history.date.clone(),
                    level: history.basic.character_level.unwrap_or_default(),
                    exp: history.basic.character_exp.unwrap_or_default(),
                    exp_rate: history.basic.character_exp_rate.clone().unwrap_or_default(),
                    access_flag: history.basic.access_flag.clone(),
                    raw_json: serde_json::to_string(&serde_json::json!({
                        "character_level": history.basic.character_level,
                        "character_exp": history.basic.character_exp,
                        "character_exp_rate": history.basic.character_exp_rate,
                        "access_flag": history.basic.access_flag,
                    }))?,
                },
            )?;
        }
        crate::db::recalculate_character(connection_ref, character.id)?;
    }
    let today = chrono::Utc::now()
        .with_timezone(&chrono_tz::Asia::Seoul)
        .date_naive()
        .to_string();
    let members = input
        .rows
        .iter()
        .filter(|row| row.is_guild_member)
        .map(|row| row.basic.character_name.clone())
        .collect::<Vec<_>>();
    transaction.commit()?;
    crate::db::replace_memberships(&mut connection, &today, &members)?;
    crate::db::mobile_widget_snapshot_for_date(&connection, &today)
}


#[cfg(test)]
mod tests {
    use super::import;

    fn row(name: &str, guild: Option<&str>, days: usize) -> serde_json::Value {
        let start = chrono::NaiveDate::from_ymd_opt(2026, 8, 1).unwrap();
        let history = (0..days)
            .map(|day| {
                serde_json::json!({"date":(start + chrono::Duration::days(day as i64)).to_string(),
                    "basic":{"character_level":286,"character_exp":1000 + day as i64,"character_exp_rate":"10.000"}})
            })
            .collect::<Vec<_>>();
        serde_json::json!({"ocid":format!("ocid-{name}"),"observedAt":"2026-09-19T05:00:00Z","isGuildMember":guild.is_some(),"history":history,
            "basic":{"character_name":name,"world_name":"스카니아","character_class":"나이트로드","character_level":286,"character_exp":"2000","character_exp_rate":"36.388","character_guild_name":guild}})
    }

    fn temp_db(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("direct-import-{label}-{}.sqlite3", uuid_like()));
        let _ = std::fs::remove_file(&path);
        path
    }
    fn uuid_like() -> u128 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    }

    #[test]
    fn long_history_is_trimmed_to_latest_31_days_instead_of_rejected() {
        let path = temp_db("history");
        let payload = serde_json::json!({"primary":"대표","favorites":["친구"],"guildKey":"g1","rows":[row("대표",Some("길드"),40),row("친구",Some("길드"),35)]});
        let snapshot = import(&path, &payload.to_string()).expect("31일 초과 기록도 가져와야 합니다");
        assert!(snapshot.updated_at.is_some());
        assert_eq!(snapshot.characters.len(), 2);
        let connection = crate::db::open(&path).unwrap();
        let (count, first): (i64, String) = connection
            .query_row("SELECT count(*), min(date) FROM daily_snapshots WHERE character_id=(SELECT id FROM characters WHERE current_name='대표')", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(count, 31);
        assert_eq!(first, "2026-08-10");
    }

    #[test]
    fn primary_without_guild_is_still_saved_for_widgets() {
        let path = temp_db("no-guild");
        let payload = serde_json::json!({"primary":"솔로","favorites":[],"guildKey":"","rows":[row("솔로",None,3)]});
        let snapshot = import(&path, &payload.to_string()).unwrap();
        assert!(snapshot.characters.iter().any(|character| character.is_primary));
        let connection = crate::db::open(&path).unwrap();
        assert!(crate::db::get_setting(&connection, "primary_character_id").unwrap().is_some());
        assert!(crate::db::get_setting(&connection, "oguild_id").unwrap().is_none());
    }

    #[test]
    fn characters_or_days_with_empty_values_are_skipped_not_fatal() {
        let path = temp_db("nulls");
        let mut empty = row("휴면", Some("길드"), 2);
        empty["basic"]["character_level"] = serde_json::Value::Null;
        empty["basic"]["character_exp"] = serde_json::Value::Null;
        let mut primary = row("대표", Some("길드"), 6);
        primary["history"][1]["basic"]["character_exp"] = serde_json::Value::Null;
        primary["history"][2]["basic"]["character_exp"] = serde_json::json!("해석불가");
        primary["history"][3]["basic"]["character_exp"] = serde_json::json!("1.5e3");
        let payload = serde_json::json!({"primary":"대표","favorites":["휴면"],"guildKey":"g1","rows":[primary,empty]});
        let snapshot = import(&path, &payload.to_string()).expect("빈 값이 있어도 나머지는 가져와야 합니다");
        assert!(snapshot.characters.iter().any(|character| character.is_primary));
        let connection = crate::db::open(&path).unwrap();
        let days: i64 = connection
            .query_row("SELECT count(*) FROM daily_snapshots WHERE character_id=(SELECT id FROM characters WHERE current_name='대표')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(days, 4);
    }

    #[test]
    fn widget_snapshot_can_be_rebuilt_from_saved_records_without_network() {
        let path = temp_db("rebuild");
        let payload = serde_json::json!({"primary":"대표","favorites":["친구"],"guildKey":"g1","rows":[row("대표",Some("길드"),3),row("친구",Some("길드"),3)]});
        import(&path, &payload.to_string()).unwrap();
        let rebuilt = crate::sync::rebuild_mobile_widget_snapshot(&path).unwrap();
        let names = rebuilt.characters.iter().map(|character| character.character_name.as_str()).collect::<Vec<_>>();
        assert!(names.contains(&"대표") && names.contains(&"친구"));
    }

    #[test]
    fn favorites_are_replaced_by_the_app_list() {
        let path = temp_db("favorites");
        let first = serde_json::json!({"primary":"대표","favorites":["예전친구"],"guildKey":"g1","rows":[row("대표",Some("길드"),2),row("예전친구",Some("길드"),2)]});
        import(&path, &first.to_string()).unwrap();
        let second = serde_json::json!({"primary":"대표","favorites":[],"guildKey":"g1","rows":[row("대표",Some("길드"),2),row("예전친구",Some("길드"),2)]});
        let snapshot = import(&path, &second.to_string()).unwrap();
        let names = snapshot.characters.iter().map(|character| character.character_name.as_str()).collect::<Vec<_>>();
        assert_eq!(names, vec!["대표"]);
    }
}
