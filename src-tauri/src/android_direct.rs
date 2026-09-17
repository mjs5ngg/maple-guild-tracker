// Android 공개 화면의 직접 조회 결과를 네이티브 SQLite와 Keystore에 연결합니다.
use std::path::Path;

use jni::{
    objects::{JClass, JString},
    sys::{jboolean, JNI_FALSE, JNI_TRUE},
    JNIEnv,
};
use serde::{de::Error as _, Deserialize, Deserializer};

use crate::models::{CharacterBasic, Snapshot};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectHistory {
    date: String,
    basic: DirectHistoryBasic,
}

#[derive(Deserialize)]
struct DirectHistoryBasic {
    character_level: i64,
    #[serde(deserialize_with = "integer_from_string_or_number")]
    character_exp: i64,
    character_exp_rate: String,
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
    character_level: i64,
    #[serde(deserialize_with = "integer_from_string_or_number")]
    character_exp: i64,
    character_exp_rate: String,
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
            character_level: self.character_level,
            character_exp: self.character_exp,
            character_exp_rate: self.character_exp_rate.clone(),
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

fn integer_from_string_or_number<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(value) => value
            .as_i64()
            .ok_or_else(|| D::Error::custom("정수 범위를 벗어났습니다.")),
        serde_json::Value::String(value) => value.parse().map_err(D::Error::custom),
        _ => Err(D::Error::custom("숫자 또는 숫자 문자열이 필요합니다.")),
    }
}

fn import(path: &Path, payload: &str) -> Result<(), crate::AppError> {
    let input: DirectImport = serde_json::from_str(payload)?;
    if input.primary.is_empty()
        || input.primary.chars().count() > 20
        || input.favorites.len() > 30
        || input.rows.len() > 1000
        || input.rows.iter().any(|row| row.history.len() > 31)
    {
        return Err(crate::AppError::Validation(
            "Android 직접 조회 결과의 범위를 확인해 주세요.".into(),
        ));
    }
    let mut connection = crate::db::open(path)?;
    crate::db::migrate(&connection)?;
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
    if !guild_name.is_empty() && !input.guild_key.is_empty() {
        let primary_basic = primary.basic.as_character_basic();
        crate::db::save_setup(
            &connection,
            &primary_basic,
            &primary.ocid,
            &guild_name,
            &input.guild_key,
        )?;
    }
    connection.execute("UPDATE characters SET is_favorite=is_primary", [])?;
    let favorite_names: std::collections::HashSet<&str> =
        input.favorites.iter().map(String::as_str).collect();
    for row in &input.rows {
        let favorite = row.basic.character_name == input.primary
            || favorite_names.contains(row.basic.character_name.as_str());
        let character = crate::db::upsert_character(
            &connection,
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
            &connection,
            &Snapshot {
                character_id: character.id,
                date: String::new(),
                level: row.basic.character_level,
                exp: row.basic.character_exp,
                exp_rate: row.basic.character_exp_rate.clone(),
                access_flag: row.basic.access_flag.clone(),
                raw_json: serde_json::to_string(&row.basic.as_character_basic())?,
            },
            &observed_at,
        )?;
        for history in &row.history {
            crate::db::save_snapshot(
                &connection,
                &Snapshot {
                    character_id: character.id,
                    date: history.date.clone(),
                    level: history.basic.character_level,
                    exp: history.basic.character_exp,
                    exp_rate: history.basic.character_exp_rate.clone(),
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
        crate::db::recalculate_character(&connection, character.id)?;
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
    crate::db::replace_memberships(&mut connection, &today, &members)?;
    Ok(())
}

#[no_mangle]
pub extern "system" fn Java_com_guildfollow_mobile_MainActivity_storeServiceKey(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jboolean {
    let value = match env.get_string(&value) {
        Ok(value) => String::from(value),
        Err(_) => return JNI_FALSE,
    };
    if !value.trim().is_empty() && value.len() <= 2048 && crate::credential_set(&value).is_ok() {
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_com_guildfollow_mobile_MainActivity_importDirectSnapshots(
    mut env: JNIEnv,
    _class: JClass,
    db_path: JString,
    payload: JString,
) -> jboolean {
    let path = match env.get_string(&db_path) {
        Ok(value) => String::from(value),
        Err(_) => return JNI_FALSE,
    };
    let payload = match env.get_string(&payload) {
        Ok(value) => String::from(value),
        Err(_) => return JNI_FALSE,
    };
    if import(Path::new(&path), &payload).is_ok() {
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}
