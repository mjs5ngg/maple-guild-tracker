// 길드와 캐릭터의 과거·일일 데이터를 수집하고 누락 날짜를 보충합니다.
use std::{collections::BTreeSet, sync::Arc};

use chrono::{DateTime, Duration, NaiveDate, Timelike, Utc};
use chrono_tz::Asia::Seoul;
use futures::{stream, StreamExt};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    credential_get, db,
    models::{CharacterRecord, Snapshot, SyncProgress, SyncReport},
    AppError, AppState,
};

pub fn latest_completed_date(now: DateTime<Utc>) -> NaiveDate {
    let local = now.with_timezone(&Seoul);
    let days_back = if local.hour() < 2 || (local.hour() == 2 && local.minute() < 15) {
        2
    } else {
        1
    };
    local.date_naive() - Duration::days(days_back)
}

fn emit_progress(
    app: &AppHandle,
    phase: &str,
    completed: usize,
    total: usize,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            phase: phase.to_string(),
            completed,
            total,
            message: message.into(),
        },
    );
}

fn date_range(start: NaiveDate, end: NaiveDate) -> Vec<String> {
    let count = (end - start).num_days();
    (0..=count)
        .map(|offset| {
            (start + Duration::days(offset))
                .format("%Y-%m-%d")
                .to_string()
        })
        .collect()
}

pub async fn sync_all(app: AppHandle, requested_days: Option<u32>) -> Result<SyncReport, AppError> {
    let state = app.state::<AppState>();
    let _guard = state.sync_lock.lock().await;
    let api_key = Arc::new(credential_get()?);
    let client = state.nexon.clone();
    let end = latest_completed_date(Utc::now());

    let connection = db::open(&state.db_path)?;
    let oguild_id = db::get_setting(&connection, "oguild_id")?
        .ok_or_else(|| AppError::Validation("먼저 대표 캐릭터를 설정해 주세요.".into()))?;
    let world_name = db::get_setting(&connection, "world_name")?.unwrap_or_default();
    let latest_local: Option<String> =
        connection.query_row("SELECT MAX(date) FROM guild_memberships", [], |row| {
            row.get(0)
        })?;
    if requested_days.is_none() {
        if let Some(latest) = latest_local.as_deref() {
            let parsed = NaiveDate::parse_from_str(latest, "%Y-%m-%d")?;
            let missing_current: i64 = connection.query_row(
                r#"SELECT COUNT(*) FROM guild_memberships gm
                   LEFT JOIN daily_snapshots ds ON ds.character_id=gm.character_id AND ds.date=gm.date
                   WHERE gm.date=?1 AND (gm.character_id IS NULL OR ds.character_id IS NULL)"#,
                rusqlite::params![end.format("%Y-%m-%d").to_string()],
                |row| row.get(0),
            )?;
            let missing_favorites: i64 = connection.query_row(
                r#"SELECT COUNT(*) FROM characters c
                   LEFT JOIN daily_snapshots ds ON ds.character_id=c.id AND ds.date=?1
                   WHERE c.is_favorite=1 AND ds.character_id IS NULL"#,
                rusqlite::params![end.format("%Y-%m-%d").to_string()],
                |row| row.get(0),
            )?;
            if parsed >= end && missing_current == 0 && missing_favorites == 0 {
                return Ok(SyncReport {
                    target_start: latest.to_string(),
                    target_end: latest.to_string(),
                    success_count: 0,
                    failure_count: 0,
                    unresolved_characters: vec![],
                });
            }
        }
    }
    let start = if let Some(days) = requested_days {
        end - Duration::days(days.min(30) as i64)
    } else if let Some(latest) = latest_local {
        let parsed = NaiveDate::parse_from_str(&latest, "%Y-%m-%d")?;
        if parsed >= end {
            end
        } else {
            parsed
        }
    } else {
        end - Duration::days(30)
    };
    let dates = date_range(start, end);
    let start_string = start.format("%Y-%m-%d").to_string();
    let end_string = end.format("%Y-%m-%d").to_string();
    connection.execute(
        "INSERT INTO sync_runs(target_start, target_end, status) VALUES (?1, ?2, 'running')",
        rusqlite::params![start_string, end_string],
    )?;
    let run_id = connection.last_insert_rowid();
    drop(connection);

    let mut success_count = 0_usize;
    let mut failure_count = 0_usize;
    let mut all_names = BTreeSet::new();
    for (index, date) in dates.iter().enumerate() {
        emit_progress(
            &app,
            "guild",
            index,
            dates.len(),
            format!("{date} 길드원 목록을 확인하고 있습니다."),
        );
        match client.guild_basic(&api_key, &oguild_id, date).await {
            Ok(guild) => {
                let mut connection = db::open(&state.db_path)?;
                db::replace_memberships(&mut connection, date, &guild.guild_member)?;
                all_names.extend(guild.guild_member);
                success_count += 1;
            }
            Err(_) => failure_count += 1,
        }
    }

    let names: Vec<String> = all_names.into_iter().collect();
    let resolution_results = stream::iter(names.iter().cloned())
        .map(|name| {
            let client = client.clone();
            let key = api_key.clone();
            async move { (name.clone(), client.ocid(&key, &name).await) }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    let mut unresolved = Vec::new();
    let mut characters = Vec::new();
    for (index, (name, result)) in resolution_results.into_iter().enumerate() {
        emit_progress(
            &app,
            "identity",
            index + 1,
            names.len(),
            format!("{name} 캐릭터를 연결했습니다."),
        );
        match result {
            Ok(ocid) => {
                let connection = db::open(&state.db_path)?;
                let record =
                    db::upsert_character(&connection, &name, &world_name, "", &ocid, false)?;
                db::link_memberships(&connection, &name, record.id)?;
                characters.push(record);
                success_count += 1;
            }
            Err(_) => {
                unresolved.push(name);
                failure_count += 1;
            }
        }
    }

    let connection = db::open(&state.db_path)?;
    for existing in db::character_records(&connection)? {
        if !characters.iter().any(|item| item.id == existing.id) {
            characters.push(existing);
        }
    }
    drop(connection);

    let jobs: Vec<(CharacterRecord, String)> = characters
        .iter()
        .flat_map(|character| {
            dates
                .iter()
                .cloned()
                .map(move |date| (character.clone(), date))
        })
        .collect();
    let total_jobs = jobs.len();
    let results = stream::iter(jobs)
        .map(|(character, date)| {
            let client = client.clone();
            let key = api_key.clone();
            async move {
                let result = client
                    .character_basic(&key, &character.ocid, Some(&date))
                    .await;
                (character, date, result)
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    for (index, (character, date, result)) in results.into_iter().enumerate() {
        if index % 10 == 0 || index + 1 == total_jobs {
            emit_progress(
                &app,
                "character",
                index + 1,
                total_jobs,
                format!("캐릭터 기록 {}/{}", index + 1, total_jobs),
            );
        }
        match result {
            Ok(basic) => {
                let connection = db::open(&state.db_path)?;
                connection.execute(
                    "UPDATE characters SET current_name=?2, world_name=?3, character_class=?4, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                    rusqlite::params![character.id, basic.character_name, basic.world_name, basic.character_class],
                )?;
                db::save_snapshot(
                    &connection,
                    &Snapshot {
                        character_id: character.id,
                        date,
                        level: basic.character_level,
                        exp: basic.character_exp,
                        exp_rate: basic.character_exp_rate.clone(),
                        access_flag: basic.access_flag.clone(),
                        raw_json: serde_json::to_string(&basic)?,
                    },
                )?;
                success_count += 1;
            }
            Err(_) => failure_count += 1,
        }
    }

    let connection = db::open(&state.db_path)?;
    for character in &characters {
        db::recalculate_character(&connection, character.id)?;
    }
    let final_status = if success_count > 0 {
        "success"
    } else {
        "failed"
    };
    connection.execute(
        "UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP, status=?2, success_count=?3, failure_count=?4, message=?5 WHERE id=?1",
        rusqlite::params![run_id, final_status, success_count as i64, failure_count as i64, format!("미연결 {}명", unresolved.len())],
    )?;
    emit_progress(
        &app,
        "complete",
        total_jobs,
        total_jobs,
        "동기화를 마쳤습니다.",
    );
    Ok(SyncReport {
        target_start: start_string,
        target_end: end_string,
        success_count,
        failure_count,
        unresolved_characters: unresolved,
    })
}

pub async fn background_loop(app: AppHandle) {
    tokio::time::sleep(std::time::Duration::from_secs(8)).await;
    loop {
        let configured = app.state::<AppState>().db_path.exists()
            && db::open(&app.state::<AppState>().db_path)
                .and_then(|connection| db::get_setting(&connection, "primary_name"))
                .ok()
                .flatten()
                .is_some();
        if configured {
            let _ = sync_all(app.clone(), None).await;
        }
        tokio::time::sleep(std::time::Duration::from_secs(15 * 60)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn completed_date_uses_two_fifteen_cutoff() {
        let before = Utc.with_ymd_and_hms(2026, 8, 18, 17, 14, 0).unwrap();
        let after = Utc.with_ymd_and_hms(2026, 8, 18, 17, 15, 0).unwrap();
        assert_eq!(latest_completed_date(before).to_string(), "2026-08-17");
        assert_eq!(latest_completed_date(after).to_string(), "2026-08-18");
    }
}
