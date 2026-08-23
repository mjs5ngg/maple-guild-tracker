// Android 백그라운드에서 즐겨찾기 경험치 증가를 확인하고 알림 이벤트를 만듭니다.
#[cfg(target_os = "android")]
use std::path::Path;

#[cfg(target_os = "android")]
use serde::Serialize;

use crate::exp::{self, ExpCalculation};
#[cfg(target_os = "android")]
use crate::{credential_get, db, nexon::NexonClient, AppError};

#[cfg(target_os = "android")]
#[derive(Debug, Serialize)]
struct FavoriteExpEvent {
    character_name: String,
    gained_exp: i64,
    current_exp_rate: String,
}

#[cfg(target_os = "android")]
#[derive(Debug, Serialize)]
struct NotificationCheckResult {
    ok: bool,
    checked_count: usize,
    failure_count: usize,
    events: Vec<FavoriteExpEvent>,
    error: Option<String>,
}

fn evaluate_gain(
    previous: Option<(i64, i64, bool)>,
    current_level: i64,
    current_exp: i64,
    can_notify: bool,
) -> (Option<i64>, bool, bool) {
    let Some((previous_level, previous_exp, was_active)) = previous else {
        return (None, true, false);
    };
    match exp::calculate_gain(previous_level, previous_exp, current_level, current_exp) {
        ExpCalculation::Ok(gain) if gain > 0 && can_notify && !was_active => {
            (Some(gain), true, true)
        }
        ExpCalculation::Ok(gain) if gain > 0 && can_notify => (None, true, true),
        ExpCalculation::Ok(gain) if gain > 0 => (None, false, was_active),
        _ => (None, true, false),
    }
}

#[cfg(target_os = "android")]
async fn check_favorite_exp(
    data_dir: &Path,
    can_notify: bool,
) -> Result<NotificationCheckResult, AppError> {
    let database_path = data_dir.join("tracker.sqlite3");
    if !database_path.exists() {
        return Ok(NotificationCheckResult {
            ok: true,
            checked_count: 0,
            failure_count: 0,
            events: vec![],
            error: None,
        });
    }
    let connection = db::open(&database_path)?;
    db::migrate(&connection)?;
    db::cleanup_notification_baselines(&connection)?;
    let characters = db::notification_character_records(&connection)?;
    drop(connection);

    if characters.is_empty() {
        return Ok(NotificationCheckResult {
            ok: true,
            checked_count: 0,
            failure_count: 0,
            events: vec![],
            error: None,
        });
    }

    let api_key = credential_get()?;
    let client = NexonClient::new()?;
    let mut events = Vec::new();
    let mut failure_count = 0;
    for character in &characters {
        match client.character_basic(&api_key, &character.ocid, None).await {
            Ok(current) => {
                let connection = db::open(&database_path)?;
                let previous = db::notification_baseline(&connection, character.id)?;
                let (gain, should_save, is_active) = evaluate_gain(
                    previous,
                    current.character_level,
                    current.character_exp,
                    can_notify,
                );
                if should_save {
                    db::save_notification_baseline(
                        &connection,
                        character.id,
                        current.character_level,
                        current.character_exp,
                        &current.character_exp_rate,
                        is_active,
                    )?;
                }
                if let Some(gained_exp) = gain {
                    events.push(FavoriteExpEvent {
                        character_name: current.character_name,
                        gained_exp,
                        current_exp_rate: current.character_exp_rate,
                    });
                }
            }
            Err(_) => failure_count += 1,
        }
    }
    let ok = failure_count == 0;
    Ok(NotificationCheckResult {
        ok,
        checked_count: characters.len(),
        failure_count,
        events,
        error: (!ok).then(|| format!("즐겨찾기 {failure_count}명의 최신 정보를 확인하지 못했습니다.")),
    })
}

#[cfg(target_os = "android")]
#[allow(non_snake_case)]
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_mjs5ngg_guildmatefollow_FavoriteExpWorker_00024Companion_runNativeCheck(
    mut env: jni::JNIEnv,
    _class: jni::objects::JObject,
    data_dir: jni::objects::JString,
    can_notify: jni::sys::jboolean,
) -> jni::sys::jstring {
    let result = (|| -> Result<NotificationCheckResult, AppError> {
        let data_dir: String = env
            .get_string(&data_dir)
            .map_err(|error| AppError::Validation(error.to_string()))?
            .into();
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|error| AppError::Validation(error.to_string()))?;
        runtime.block_on(check_favorite_exp(Path::new(&data_dir), can_notify != 0))
    })();
    let payload = match result {
        Ok(value) => serde_json::to_string(&value).unwrap_or_else(|error| {
            format!(r#"{{"ok":false,"checked_count":0,"failure_count":0,"events":[],"error":"{error}"}}"#)
        }),
        Err(error) => serde_json::json!({
            "ok": false,
            "checked_count": 0,
            "failure_count": 0,
            "events": [],
            "error": error.public_message(),
        })
        .to_string(),
    };
    env.new_string(payload)
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_check_only_creates_a_baseline() {
        assert_eq!(evaluate_gain(None, 281, 100, true), (None, true, false));
    }

    #[test]
    fn positive_gain_creates_an_event_only_when_notifications_are_available() {
        assert_eq!(evaluate_gain(Some((281, 100, false)), 281, 200, true), (Some(100), true, true));
        assert_eq!(evaluate_gain(Some((281, 100, false)), 281, 200, false), (None, false, false));
        assert_eq!(evaluate_gain(Some((281, 100, true)), 281, 200, true), (None, true, true));
    }

    #[test]
    fn unchanged_or_reset_values_update_the_baseline_without_an_event() {
        assert_eq!(evaluate_gain(Some((281, 100, true)), 281, 100, true), (None, true, false));
        assert_eq!(evaluate_gain(Some((281, 200, true)), 281, 100, true), (None, true, false));
    }
}
