// 길드와 캐릭터의 과거·일일 데이터를 수집하고 누락 날짜를 보충합니다.
#[cfg(target_os = "android")]
use std::path::Path;
use std::{collections::BTreeSet, sync::Arc};

use chrono::{DateTime, Duration, NaiveDate, Timelike, Utc};
use chrono_tz::Asia::Seoul;
use futures::{stream, StreamExt};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "android")]
use crate::models::MobileWidgetSnapshot;
use crate::{
    credential_get, db,
    models::{Snapshot, SyncProgress, SyncReport},
    AppError, AppState,
};

const STARTUP_ACTIVITY_PROBE_DELAYS: [std::time::Duration; 2] = [
    std::time::Duration::from_secs(90),
    std::time::Duration::from_secs(210),
];

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
    db::fail_stale_sync_runs(&connection)?;
    let oguild_id = db::get_setting(&connection, "oguild_id")?
        .ok_or_else(|| AppError::Validation("먼저 대표 캐릭터를 설정해 주세요.".into()))?;
    let world_name = db::get_setting(&connection, "world_name")?.unwrap_or_default();
    let latest_local: Option<String> =
        connection.query_row("SELECT MAX(date) FROM guild_memberships", [], |row| {
            row.get(0)
        })?;
    let pending_backfill = db::get_setting(&connection, "backfill_start")?;
    let earliest_missing = db::earliest_missing_snapshot_date(&connection)?;
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
            if parsed >= end
                && missing_current == 0
                && missing_favorites == 0
                && pending_backfill.is_none()
                && earliest_missing.is_none()
            {
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
    } else if let Some(pending) = pending_backfill {
        NaiveDate::parse_from_str(&pending, "%Y-%m-%d")?
    } else if let Some(missing) = earliest_missing {
        NaiveDate::parse_from_str(&missing, "%Y-%m-%d")?
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
    if requested_days.is_some() {
        db::set_setting(&connection, "backfill_start", &start_string)?;
    }
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
        let existing_members = {
            let connection = db::open(&state.db_path)?;
            db::membership_names(&connection, date)?
        };
        if !existing_members.is_empty() {
            all_names.extend(existing_members);
            continue;
        }
        match client.guild_basic(&api_key, &oguild_id, date).await {
            Ok(guild) => {
                let mut connection = db::open(&state.db_path)?;
                db::replace_memberships(&mut connection, date, &guild.guild_member)?;
                all_names.extend(guild.guild_member);
                success_count += 1;
            }
            Err(error) => {
                failure_count += 1;
                if matches!(error, AppError::Api { status: 429, .. }) {
                    let connection = db::open(&state.db_path)?;
                    db::finish_sync_run(
                        &connection,
                        run_id,
                        "waiting",
                        success_count,
                        failure_count,
                        "NEXON API 호출 한도에 도달하여 다음 실행에서 재개합니다.",
                    )?;
                    emit_progress(
                        &app,
                        "waiting",
                        index,
                        dates.len(),
                        "API 호출 한도에 도달했습니다. 다음 실행에서 이어집니다.",
                    );
                    return Err(AppError::Validation(
                        "NEXON API 호출 한도에 도달했습니다. 지금까지 받은 기록은 저장했으며 다음 실행에서 이어집니다.".into(),
                    ));
                }
            }
        }
    }

    let mut characters = Vec::new();
    let mut names = Vec::new();
    let connection = db::open(&state.db_path)?;
    for name in all_names {
        if let Some(record) = db::character_record_by_name(&connection, &name)? {
            db::link_memberships(&connection, &name, record.id)?;
            characters.push(record);
        } else {
            names.push(name);
        }
    }
    drop(connection);

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
                    db::upsert_character(&connection, &name, &world_name, "", None, &ocid, false)?;
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

    let connection = db::open(&state.db_path)?;
    let jobs = db::missing_snapshot_jobs(&connection, &characters, &dates)?;
    drop(connection);
    let total_jobs = jobs.len();
    emit_progress(
        &app,
        "character",
        0,
        total_jobs,
        format!("캐릭터 기록 0/{total_jobs}"),
    );
    let mut results = stream::iter(jobs)
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
        .buffer_unordered(5);

    let mut index = 0_usize;
    while let Some((character, date, result)) = results.next().await {
        index += 1;
        if index.is_multiple_of(10) || index == total_jobs {
            emit_progress(
                &app,
                "character",
                index,
                total_jobs,
                format!("캐릭터 기록 {index}/{total_jobs}"),
            );
        }
        match result {
            Ok(basic) => {
                let connection = db::open(&state.db_path)?;
                if date == end_string {
                    connection.execute(
                        "UPDATE characters SET current_name=?2, world_name=?3, character_class=?4, image_url=COALESCE(?5, image_url), updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                        rusqlite::params![character.id, basic.character_name, basic.world_name, basic.character_class, basic.character_image],
                    )?;
                }
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
            Err(error) => {
                failure_count += 1;
                if matches!(error, AppError::Api { status: 429, .. }) {
                    let connection = db::open(&state.db_path)?;
                    db::finish_sync_run(
                        &connection,
                        run_id,
                        "waiting",
                        success_count,
                        failure_count,
                        "NEXON API 호출 한도에 도달하여 다음 실행에서 재개합니다.",
                    )?;
                    emit_progress(
                        &app,
                        "waiting",
                        index,
                        total_jobs,
                        "API 호출 한도에 도달했습니다. 저장된 지점부터 다음 실행에서 이어집니다.",
                    );
                    return Err(AppError::Validation(
                        "NEXON API 호출 한도에 도달했습니다. 지금까지 받은 기록은 저장했으며 다음 실행에서 이어집니다.".into(),
                    ));
                }
            }
        }
    }

    let connection = db::open(&state.db_path)?;
    emit_progress(
        &app,
        "calculate",
        0,
        characters.len(),
        "저장된 경험치를 계산하고 있습니다.",
    );
    for (index, character) in characters.iter().enumerate() {
        db::recalculate_character(&connection, character.id)?;
        if (index + 1).is_multiple_of(10) || index + 1 == characters.len() {
            emit_progress(
                &app,
                "calculate",
                index + 1,
                characters.len(),
                format!("경험치 계산 {}/{}", index + 1, characters.len()),
            );
        }
    }
    let final_status = if success_count > 0 {
        "success"
    } else {
        "failed"
    };
    db::finish_sync_run(
        &connection,
        run_id,
        final_status,
        success_count,
        failure_count,
        &format!("미연결 {}명", unresolved.len()),
    )?;
    if failure_count == 0 {
        db::delete_setting(&connection, "backfill_start")?;
    }
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

pub async fn sync_live(app: AppHandle) -> Result<SyncReport, AppError> {
    let state = app.state::<AppState>();
    let _guard = state.sync_lock.lock().await;
    let api_key = Arc::new(credential_get()?);
    let client = state.nexon.clone();
    let connection = db::open(&state.db_path)?;
    let characters = db::live_character_records(&connection)?;
    drop(connection);
    let total = characters.len();
    emit_progress(&app, "live", 0, total, format!("최신 정보 0/{total}"));
    let mut results = stream::iter(characters)
        .map(|character| {
            let client = client.clone();
            let key = api_key.clone();
            async move {
                let result = client.character_basic(&key, &character.ocid, None).await;
                (character, result)
            }
        })
        .buffer_unordered(5);
    let mut completed = 0_usize;
    let mut success_count = 0_usize;
    let mut failure_count = 0_usize;
    while let Some((character, result)) = results.next().await {
        completed += 1;
        match result {
            Ok(basic) => {
                let raw_json = serde_json::to_string(&basic)?;
                let connection = db::open(&state.db_path)?;
                connection.execute(
                    "UPDATE characters SET current_name=?2, world_name=?3, character_class=?4, image_url=COALESCE(?5,image_url), updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                    rusqlite::params![character.id, basic.character_name, basic.world_name, basic.character_class, basic.character_image],
                )?;
                db::save_live_snapshot(
                    &connection,
                    &Snapshot {
                        character_id: character.id,
                        date: String::new(),
                        level: basic.character_level,
                        exp: basic.character_exp,
                        exp_rate: basic.character_exp_rate,
                        access_flag: basic.access_flag,
                        raw_json,
                    },
                )?;
                success_count += 1;
            }
            Err(_) => failure_count += 1,
        }
        if completed.is_multiple_of(10) || completed == total {
            emit_progress(
                &app,
                "live",
                completed,
                total,
                format!("최신 정보 {completed}/{total}"),
            );
        }
    }
    emit_progress(
        &app,
        "complete",
        total,
        total,
        "최신 정보 수집을 마쳤습니다.",
    );
    let now = Utc::now()
        .with_timezone(&Seoul)
        .format("%Y-%m-%d %H:%M")
        .to_string();
    Ok(SyncReport {
        target_start: now.clone(),
        target_end: now,
        success_count,
        failure_count,
        unresolved_characters: vec![],
    })
}

#[cfg(target_os = "android")]
pub async fn sync_mobile_widget(db_path: &Path) -> Result<MobileWidgetSnapshot, AppError> {
    let api_key = Arc::new(credential_get()?);
    let client = crate::nexon::NexonClient::new()?;
    let connection = db::open(db_path)?;
    db::migrate(&connection)?;
    if db::get_setting(&connection, "primary_character_id")?.is_none() {
        return Err(AppError::Validation(
            "먼저 대표 캐릭터를 설정해 주세요.".into(),
        ));
    }
    let characters = db::widget_character_records(&connection)?;
    let completed_date = latest_completed_date(Utc::now())
        .format("%Y-%m-%d")
        .to_string();
    let jobs = characters
        .into_iter()
        .map(|character| {
            let has_daily = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM daily_snapshots WHERE character_id=?1 AND date=?2)",
                    rusqlite::params![character.id, completed_date],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false);
            (character, !has_daily)
        })
        .collect::<Vec<_>>();
    drop(connection);

    let results = stream::iter(jobs)
        .map(|(character, needs_daily)| {
            let client = client.clone();
            let key = api_key.clone();
            let date = completed_date.clone();
            async move {
                let live = client.character_basic(&key, &character.ocid, None).await;
                let daily = if needs_daily {
                    Some(
                        client
                            .character_basic(&key, &character.ocid, Some(&date))
                            .await,
                    )
                } else {
                    None
                };
                (character, date, live, daily)
            }
        })
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    let mut live_successes = 0_usize;
    for (character, date, live, daily) in results {
        if let Ok(basic) = live {
            let raw_json = serde_json::to_string(&basic)?;
            let connection = db::open(db_path)?;
            connection.execute(
                "UPDATE characters SET current_name=?2, world_name=?3, character_class=?4, image_url=COALESCE(?5,image_url), updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                rusqlite::params![character.id, basic.character_name, basic.world_name, basic.character_class, basic.character_image],
            )?;
            db::save_live_snapshot(
                &connection,
                &Snapshot {
                    character_id: character.id,
                    date: String::new(),
                    level: basic.character_level,
                    exp: basic.character_exp,
                    exp_rate: basic.character_exp_rate,
                    access_flag: basic.access_flag,
                    raw_json,
                },
            )?;
            live_successes += 1;
        }
        if let Some(Ok(basic)) = daily {
            let raw_json = serde_json::to_string(&basic)?;
            let connection = db::open(db_path)?;
            db::save_snapshot(
                &connection,
                &Snapshot {
                    character_id: character.id,
                    date,
                    level: basic.character_level,
                    exp: basic.character_exp,
                    exp_rate: basic.character_exp_rate,
                    access_flag: basic.access_flag,
                    raw_json,
                },
            )?;
            db::recalculate_character(&connection, character.id)?;
        }
    }
    if live_successes == 0 {
        return Err(AppError::Validation(
            "백그라운드 위젯 정보를 갱신하지 못했습니다.".into(),
        ));
    }
    let connection = db::open(db_path)?;
    db::mobile_widget_snapshot_for_date(&connection, &completed_date)
}

fn is_configured(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.db_path.exists()
        && db::open(&state.db_path)
            .and_then(|connection| db::get_setting(&connection, "primary_name"))
            .ok()
            .flatten()
            .is_some()
}

async fn run_startup_activity_probes(app: AppHandle) {
    for delay in STARTUP_ACTIVITY_PROBE_DELAYS {
        tokio::time::sleep(delay).await;
        if !is_configured(&app) {
            return;
        }
        let _ = sync_live(app.clone()).await;
    }
}

pub async fn background_loop(app: AppHandle) {
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    while !is_configured(&app) {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
    let _ = sync_live(app.clone()).await;
    tauri::async_runtime::spawn(run_startup_activity_probes(app.clone()));
    loop {
        if is_configured(&app) && sync_all(app.clone(), None).await.is_ok() {
            let _ = sync_live(app.clone()).await;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await;
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
