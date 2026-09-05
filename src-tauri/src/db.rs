// SQLite 스키마와 앱 데이터 조회·저장 작업을 제공합니다.
use std::{collections::HashSet, path::Path};

use chrono::{Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Asia::Seoul;
use rusqlite::{params, Connection, OptionalExtension};

#[cfg(any(target_os = "android", test))]
use crate::models::MobileWidgetSnapshot;
use crate::{
    exp::{self, ExpCalculation},
    models::{
        AppStatus, CharacterBasic, CharacterRecord, DashboardData, DashboardSummary, RankingRow,
        SeriesPoint, Snapshot,
    },
    AppError,
};

pub fn open(path: &Path) -> Result<Connection, AppError> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(connection)
}

pub fn migrate(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            current_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            world_name TEXT NOT NULL,
            character_class TEXT NOT NULL DEFAULT '',
            image_url TEXT,
            is_primary INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS character_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            ocid TEXT NOT NULL UNIQUE,
            valid_from TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            valid_to TEXT
        );
        CREATE TABLE IF NOT EXISTS guild_memberships (
            date TEXT NOT NULL,
            member_name TEXT NOT NULL COLLATE NOCASE,
            character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            PRIMARY KEY (date, member_name)
        );
        CREATE TABLE IF NOT EXISTS daily_snapshots (
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            level INTEGER NOT NULL,
            exp INTEGER NOT NULL,
            exp_rate TEXT NOT NULL,
            access_flag TEXT,
            raw_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (character_id, date)
        );
        CREATE TABLE IF NOT EXISTS xp_deltas (
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            from_date TEXT NOT NULL,
            gained_exp INTEGER,
            table_version TEXT NOT NULL,
            status TEXT NOT NULL,
            PRIMARY KEY (character_id, date)
        );
        CREATE TABLE IF NOT EXISTS exp_table_versions (
            version TEXT PRIMARY KEY,
            effective_date TEXT NOT NULL,
            checksum TEXT NOT NULL,
            source_note TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at TEXT,
            target_start TEXT NOT NULL,
            target_end TEXT NOT NULL,
            status TEXT NOT NULL,
            success_count INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0,
            message TEXT
        );
        CREATE TABLE IF NOT EXISTS live_snapshots (
            character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
            fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            level INTEGER NOT NULL,
            exp INTEGER NOT NULL,
            exp_rate TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            PRIMARY KEY (character_id, fetched_at)
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_snapshots(date);
        CREATE INDEX IF NOT EXISTS idx_deltas_date ON xp_deltas(date);
        CREATE INDEX IF NOT EXISTS idx_memberships_date ON guild_memberships(date);
        CREATE INDEX IF NOT EXISTS idx_live_character_time ON live_snapshots(character_id, fetched_at DESC);
        "#,
    )?;
    let has_image_url = connection
        .prepare("PRAGMA table_info(characters)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|column| column == "image_url");
    if !has_image_url {
        connection.execute("ALTER TABLE characters ADD COLUMN image_url TEXT", [])?;
    }
    connection.execute(
        "INSERT OR REPLACE INTO exp_table_versions(version, effective_date, checksum, source_note) VALUES (?1, ?2, ?3, ?4)",
        params![
            exp::EXP_TABLE_VERSION,
            "2026-03-19",
            exp::table_checksum(),
            "KMS 1.2.413 성장 동선 개편 및 현재 Non-GMS 레벨링 표. API 경험치율과 교차 검증."
        ],
    )?;
    // 원본 스냅샷은 보존하고, 날짜를 건너뛴 기존 일간 파생값만 무효화합니다.
    connection.execute(
        "UPDATE xp_deltas SET gained_exp=NULL, status='missing_snapshot' WHERE date(from_date, '+1 day') IS NOT date",
        [],
    )?;
    Ok(())
}

pub fn set_setting(connection: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_setting(connection: &Connection, key: &str) -> Result<Option<String>, AppError> {
    Ok(connection
        .query_row(
            "SELECT value FROM settings WHERE key=?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn delete_setting(connection: &Connection, key: &str) -> Result<(), AppError> {
    connection.execute("DELETE FROM settings WHERE key=?1", params![key])?;
    Ok(())
}

pub fn save_setup(
    connection: &Connection,
    basic: &CharacterBasic,
    ocid: &str,
    guild_name: &str,
    oguild_id: &str,
) -> Result<i64, AppError> {
    connection.execute("UPDATE characters SET is_primary=0", [])?;
    connection.execute(
        r#"INSERT INTO characters(current_name, world_name, character_class, image_url, is_primary, is_favorite)
           VALUES (?1, ?2, ?3, ?4, 1, 1)
           ON CONFLICT(current_name) DO UPDATE SET
             world_name=excluded.world_name, character_class=excluded.character_class,
             image_url=COALESCE(excluded.image_url, characters.image_url),
             is_primary=1, is_favorite=1, updated_at=CURRENT_TIMESTAMP"#,
        params![
            basic.character_name,
            basic.world_name,
            basic.character_class,
            basic.character_image
        ],
    )?;
    let character_id: i64 = connection.query_row(
        "SELECT id FROM characters WHERE current_name=?1 COLLATE NOCASE",
        params![basic.character_name],
        |row| row.get(0),
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO character_identities(character_id, ocid) VALUES (?1, ?2)",
        params![character_id, ocid],
    )?;
    set_setting(
        connection,
        "primary_character_id",
        &character_id.to_string(),
    )?;
    set_setting(connection, "primary_name", &basic.character_name)?;
    set_setting(connection, "world_name", &basic.world_name)?;
    set_setting(connection, "guild_name", guild_name)?;
    set_setting(connection, "oguild_id", oguild_id)?;
    Ok(character_id)
}

pub fn upsert_character(
    connection: &Connection,
    name: &str,
    world: &str,
    class_name: &str,
    image_url: Option<&str>,
    ocid: &str,
    favorite: bool,
) -> Result<CharacterRecord, AppError> {
    let identity_owner = connection
        .query_row(
            "SELECT character_id FROM character_identities WHERE ocid=?1 AND valid_to IS NULL",
            params![ocid],
            |row| row.get::<_, i64>(0),
        )
        .optional()?;
    if let Some(owner_id) = identity_owner {
        let duplicate_id = connection
            .query_row(
                r#"SELECT c.id FROM characters c
                   WHERE c.current_name=?1 COLLATE NOCASE AND c.id<>?2
                     AND NOT EXISTS(SELECT 1 FROM character_identities ci WHERE ci.character_id=c.id)"#,
                params![name, owner_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if let Some(duplicate_id) = duplicate_id {
            let transaction = connection.unchecked_transaction()?;
            transaction.execute(
                "UPDATE guild_memberships SET character_id=?1 WHERE character_id=?2",
                params![owner_id, duplicate_id],
            )?;
            transaction.execute(
                r#"INSERT OR IGNORE INTO daily_snapshots(character_id,date,level,exp,exp_rate,access_flag,raw_json,fetched_at)
                   SELECT ?1,date,level,exp,exp_rate,access_flag,raw_json,fetched_at FROM daily_snapshots WHERE character_id=?2"#,
                params![owner_id, duplicate_id],
            )?;
            transaction.execute(
                r#"INSERT OR IGNORE INTO xp_deltas(character_id,date,from_date,gained_exp,table_version,status)
                   SELECT ?1,date,from_date,gained_exp,table_version,status FROM xp_deltas WHERE character_id=?2"#,
                params![owner_id, duplicate_id],
            )?;
            transaction.execute(
                r#"UPDATE characters SET
                     is_primary=MAX(is_primary,(SELECT is_primary FROM characters WHERE id=?2)),
                     is_favorite=MAX(is_favorite,(SELECT is_favorite FROM characters WHERE id=?2))
                   WHERE id=?1"#,
                params![owner_id, duplicate_id],
            )?;
            transaction.execute(
                "UPDATE settings SET value=?1 WHERE key='primary_character_id' AND value=?2",
                params![owner_id.to_string(), duplicate_id.to_string()],
            )?;
            transaction.execute("DELETE FROM characters WHERE id=?1", params![duplicate_id])?;
            transaction.commit()?;
        }
        connection.execute(
            r#"UPDATE characters SET current_name=?2, world_name=?3,
                 character_class=CASE WHEN ?4='' THEN character_class ELSE ?4 END,
                 image_url=COALESCE(?5,image_url), is_favorite=MAX(is_favorite,?6),
                 updated_at=CURRENT_TIMESTAMP WHERE id=?1"#,
            params![
                owner_id,
                name,
                world,
                class_name,
                image_url,
                favorite as i64
            ],
        )?;
        let is_primary: bool = connection.query_row(
            "SELECT is_primary FROM characters WHERE id=?1",
            params![owner_id],
            |row| row.get(0),
        )?;
        if is_primary {
            set_setting(connection, "primary_character_id", &owner_id.to_string())?;
            set_setting(connection, "primary_name", name)?;
        }
        return Ok(CharacterRecord {
            id: owner_id,
            ocid: ocid.to_string(),
        });
    }
    connection.execute(
        r#"INSERT INTO characters(current_name, world_name, character_class, image_url, is_favorite)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(current_name) DO UPDATE SET
             world_name=excluded.world_name,
             character_class=CASE WHEN excluded.character_class='' THEN characters.character_class ELSE excluded.character_class END,
             image_url=COALESCE(excluded.image_url, characters.image_url),
             is_favorite=MAX(characters.is_favorite, excluded.is_favorite),
             updated_at=CURRENT_TIMESTAMP"#,
        params![name, world, class_name, image_url, favorite as i64],
    )?;
    let id: i64 = connection.query_row(
        "SELECT id FROM characters WHERE current_name=?1 COLLATE NOCASE",
        params![name],
        |row| row.get(0),
    )?;
    connection.execute(
        "INSERT INTO character_identities(character_id, ocid) VALUES (?1, ?2)",
        params![id, ocid],
    )?;
    Ok(CharacterRecord {
        id,
        ocid: ocid.to_string(),
    })
}

pub fn character_records(connection: &Connection) -> Result<Vec<CharacterRecord>, AppError> {
    let mut statement = connection.prepare(
        r#"SELECT c.id, ci.ocid
           FROM characters c
           JOIN character_identities ci ON ci.character_id=c.id AND ci.valid_to IS NULL"#,
    )?;
    let rows = statement.query_map([], |row| {
        Ok(CharacterRecord {
            id: row.get(0)?,
            ocid: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn character_record_by_name(
    connection: &Connection,
    name: &str,
) -> Result<Option<CharacterRecord>, AppError> {
    Ok(connection
        .query_row(
            r#"SELECT c.id, ci.ocid
               FROM characters c
               JOIN character_identities ci ON ci.character_id=c.id AND ci.valid_to IS NULL
               WHERE c.current_name=?1 COLLATE NOCASE"#,
            params![name],
            |row| {
                Ok(CharacterRecord {
                    id: row.get(0)?,
                    ocid: row.get(1)?,
                })
            },
        )
        .optional()?)
}

pub fn missing_snapshot_jobs(
    connection: &Connection,
    characters: &[CharacterRecord],
    dates: &[String],
) -> Result<Vec<(CharacterRecord, String)>, AppError> {
    if dates.is_empty() {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare("SELECT character_id, date FROM daily_snapshots WHERE date BETWEEN ?1 AND ?2")?;
    let existing = statement
        .query_map(
            params![dates.first().unwrap(), dates.last().unwrap()],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )?
        .collect::<Result<HashSet<_>, _>>()?;
    Ok(characters
        .iter()
        .flat_map(|character| {
            let existing = &existing;
            dates.iter().filter_map(move |date| {
                if existing.contains(&(character.id, date.clone())) {
                    None
                } else {
                    Some((character.clone(), date.clone()))
                }
            })
        })
        .collect())
}

pub fn finish_sync_run(
    connection: &Connection,
    run_id: i64,
    status: &str,
    success_count: usize,
    failure_count: usize,
    message: &str,
) -> Result<(), AppError> {
    connection.execute(
        "UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP, status=?2, success_count=?3, failure_count=?4, message=?5 WHERE id=?1",
        params![run_id, status, success_count as i64, failure_count as i64, message],
    )?;
    Ok(())
}

pub fn fail_stale_sync_runs(connection: &Connection) -> Result<(), AppError> {
    connection.execute(
        r#"UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP, status='failed',
             message='이전 동기화가 비정상 종료되어 새 실행에서 정리했습니다.'
           WHERE status='running' AND finished_at IS NULL"#,
        [],
    )?;
    Ok(())
}

pub fn replace_memberships(
    connection: &mut Connection,
    date: &str,
    members: &[String],
) -> Result<(), AppError> {
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM guild_memberships WHERE date=?1", params![date])?;
    for name in members {
        let character_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM characters WHERE current_name=?1 COLLATE NOCASE",
                params![name],
                |row| row.get(0),
            )
            .optional()?;
        transaction.execute(
            "INSERT INTO guild_memberships(date, member_name, character_id) VALUES (?1, ?2, ?3)",
            params![date, name, character_id],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn membership_names(connection: &Connection, date: &str) -> Result<Vec<String>, AppError> {
    let mut statement = connection
        .prepare("SELECT member_name FROM guild_memberships WHERE date=?1 ORDER BY member_name")?;
    let rows = statement.query_map(params![date], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn earliest_missing_snapshot_date(connection: &Connection) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            r#"SELECT MIN(date) FROM (SELECT gm.date
           FROM guild_memberships gm
           LEFT JOIN daily_snapshots ds ON ds.character_id=gm.character_id AND ds.date=gm.date
           WHERE gm.character_id IS NOT NULL AND ds.character_id IS NULL
           UNION ALL
           SELECT date(xd.from_date, '+1 day') FROM xp_deltas xd
           JOIN characters c ON c.id=xd.character_id
           WHERE xd.status='missing_snapshot' AND (c.is_primary=1 OR c.is_favorite=1))"#,
            [],
            |row| row.get(0),
        )
        .map_err(AppError::from)
}

pub fn link_memberships(
    connection: &Connection,
    name: &str,
    character_id: i64,
) -> Result<(), AppError> {
    connection.execute(
        "UPDATE guild_memberships SET character_id=?1 WHERE member_name=?2 COLLATE NOCASE",
        params![character_id, name],
    )?;
    Ok(())
}

pub fn save_snapshot(connection: &Connection, snapshot: &Snapshot) -> Result<(), AppError> {
    connection.execute(
        r#"INSERT INTO daily_snapshots(character_id, date, level, exp, exp_rate, access_flag, raw_json)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(character_id, date) DO UPDATE SET
             level=excluded.level, exp=excluded.exp, exp_rate=excluded.exp_rate,
             access_flag=excluded.access_flag, raw_json=excluded.raw_json, fetched_at=CURRENT_TIMESTAMP"#,
        params![snapshot.character_id, snapshot.date, snapshot.level, snapshot.exp, snapshot.exp_rate, snapshot.access_flag, snapshot.raw_json],
    )?;
    Ok(())
}

#[cfg(test)]
pub fn save_live_snapshot(connection: &Connection, snapshot: &Snapshot) -> Result<(), AppError> {
    save_live_snapshot_at(
        connection,
        snapshot,
        &Utc::now().format("%Y-%m-%d %H:%M:%S%.6f").to_string(),
    )
}

pub fn save_live_snapshot_at(
    connection: &Connection,
    snapshot: &Snapshot,
    observed_at: &str,
) -> Result<(), AppError> {
    connection.execute(
        r#"INSERT INTO live_snapshots(character_id, level, exp, exp_rate, raw_json, fetched_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(character_id, fetched_at) DO UPDATE SET
             level=excluded.level, exp=excluded.exp, exp_rate=excluded.exp_rate, raw_json=excluded.raw_json"#,
        params![snapshot.character_id, snapshot.level, snapshot.exp, snapshot.exp_rate, snapshot.raw_json, observed_at],
    )?;
    Ok(())
}

pub fn live_character_records(connection: &Connection) -> Result<Vec<CharacterRecord>, AppError> {
    let mut statement = connection.prepare(
        r#"SELECT c.id, ci.ocid
           FROM characters c
           JOIN character_identities ci ON ci.character_id=c.id AND ci.valid_to IS NULL
           WHERE c.is_favorite=1 OR EXISTS(
             SELECT 1 FROM guild_memberships gm
             WHERE gm.date=(SELECT MAX(date) FROM guild_memberships) AND gm.character_id=c.id
           )"#,
    )?;
    let rows = statement.query_map([], |row| {
        Ok(CharacterRecord {
            id: row.get(0)?,
            ocid: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(any(target_os = "android", test))]
pub fn widget_character_records(connection: &Connection) -> Result<Vec<CharacterRecord>, AppError> {
    let mut statement = connection.prepare(
        r#"SELECT c.id, ci.ocid
           FROM characters c
           JOIN character_identities ci ON ci.character_id=c.id AND ci.valid_to IS NULL
           WHERE c.is_primary=1 OR c.is_favorite=1"#,
    )?;
    let rows = statement.query_map([], |row| {
        Ok(CharacterRecord {
            id: row.get(0)?,
            ocid: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn set_primary(connection: &mut Connection, character_id: i64) -> Result<(), AppError> {
    let character = connection
        .query_row(
            r#"SELECT c.current_name, c.world_name
               FROM characters c
               WHERE c.id=?1 AND EXISTS(
                 SELECT 1 FROM guild_memberships gm
                 WHERE gm.date=(SELECT MAX(date) FROM guild_memberships) AND gm.character_id=c.id
               )"#,
            params![character_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            AppError::Validation("현재 길드원만 대표 캐릭터로 지정할 수 있습니다.".into())
        })?;
    let transaction = connection.transaction()?;
    transaction.execute("UPDATE characters SET is_primary=0", [])?;
    transaction.execute(
        "UPDATE characters SET is_primary=1, is_favorite=1, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![character_id],
    )?;
    transaction.execute(
        "INSERT INTO settings(key,value) VALUES ('primary_character_id',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![character_id.to_string()],
    )?;
    transaction.execute(
        "INSERT INTO settings(key,value) VALUES ('primary_name',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![character.0],
    )?;
    transaction.execute(
        "INSERT INTO settings(key,value) VALUES ('world_name',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![character.1],
    )?;
    transaction.commit()?;
    Ok(())
}

fn live_activity(
    connection: &Connection,
    character_id: i64,
) -> Result<(bool, Option<String>), AppError> {
    let mut statement = connection.prepare(
        r#"SELECT fetched_at, level, exp
           FROM live_snapshots
           WHERE character_id=?1 AND fetched_at >= datetime('now', '-20 minutes')
           ORDER BY fetched_at"#,
    )?;
    let samples = statement
        .query_map(params![character_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let latest_at = connection.query_row(
        "SELECT MAX(fetched_at) FROM live_snapshots WHERE character_id=?1",
        params![character_id],
        |row| row.get::<_, Option<String>>(0),
    )?;
    if samples.len() < 2 {
        return Ok((false, latest_at));
    }
    let first = &samples[0];
    let last = &samples[samples.len() - 1];
    let gain = exp::calculate_gain(first.1, first.2, last.1, last.2);
    Ok((
        matches!(gain, ExpCalculation::Ok(value) if value > 0),
        latest_at,
    ))
}

#[derive(Debug, PartialEq)]
struct CurrentProgress {
    level: Option<i64>,
    exp: Option<i64>,
    rate: Option<f64>,
    today_exp: Option<i64>,
    estimated: bool,
}

fn current_progress(
    connection: &Connection,
    character_id: i64,
    today_date: &str,
) -> Result<CurrentProgress, AppError> {
    let today = NaiveDate::parse_from_str(today_date, "%Y-%m-%d")?;
    let yesterday = (today - Duration::days(1)).to_string();
    let midnight = Seoul
        .from_local_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .unwrap()
        .with_timezone(&Utc);
    let midnight_key = midnight.format("%Y-%m-%d %H:%M:%S").to_string();
    let live = connection
        .query_row(
            "SELECT level, exp, exp_rate, fetched_at FROM live_snapshots WHERE character_id=?1 AND fetched_at<datetime(?2, '+1 day') ORDER BY fetched_at DESC LIMIT 1",
            params![character_id, midnight_key],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
        )
        .optional()?;
    let completed = connection
        .query_row(
            "SELECT level, exp, exp_rate FROM daily_snapshots WHERE character_id=?1 AND date<=?2 ORDER BY date DESC LIMIT 1",
            params![character_id, yesterday],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    let current_rate = live
        .as_ref()
        .and_then(|sample| sample.2.parse::<f64>().ok())
        .or_else(|| {
            completed
                .as_ref()
                .and_then(|sample| sample.2.parse::<f64>().ok())
        });
    let official_baseline = connection
        .query_row(
            "SELECT level, exp FROM daily_snapshots WHERE character_id=?1 AND date=?2",
            params![character_id, yesterday],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?;
    let estimated = official_baseline.is_none();
    // 전일 종료 기록이 없을 때만 자정에 가장 가까운 전일·당일 관측값을 기준으로 삼습니다.
    let baseline = if official_baseline.is_some() {
        official_baseline
    } else {
        connection.query_row(
            "SELECT level, exp FROM live_snapshots WHERE character_id=?1 AND fetched_at>=datetime(?2, '-1 day') AND fetched_at<datetime(?2, '+1 day') ORDER BY ABS(julianday(fetched_at)-julianday(?2)), fetched_at LIMIT 1",
            params![character_id, midnight_key],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        ).optional()?
    };
    let today_exp = live
        .as_ref()
        .filter(|to| to.3 >= midnight_key)
        .and_then(|to| {
            baseline.and_then(
                |from| match exp::calculate_gain(from.0, from.1, to.0, to.1) {
                    ExpCalculation::Ok(value) => Some(value),
                    _ => None,
                },
            )
        });
    Ok(CurrentProgress {
        level: live
            .as_ref()
            .map(|sample| sample.0)
            .or_else(|| completed.as_ref().map(|sample| sample.0)),
        exp: live
            .as_ref()
            .map(|sample| sample.1)
            .or_else(|| completed.as_ref().map(|sample| sample.1)),
        rate: current_rate,
        today_exp,
        estimated,
    })
}

#[cfg(any(target_os = "android", test))]
pub fn mobile_widget_snapshot_for_date(
    connection: &Connection,
    today_date: &str,
) -> Result<MobileWidgetSnapshot, AppError> {
    Ok(dashboard_for_date(connection, "7d", today_date)?.mobile_widget_snapshot())
}

pub fn recalculate_character(connection: &Connection, character_id: i64) -> Result<(), AppError> {
    let mut statement = connection.prepare(
        "SELECT date, level, exp FROM daily_snapshots WHERE character_id=?1 ORDER BY date",
    )?;
    let snapshots = statement
        .query_map(params![character_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for pair in snapshots.windows(2) {
        let (from_date, from_level, from_exp) = &pair[0];
        let (to_date, to_level, to_exp) = &pair[1];
        let calculation = exp::calculate_gain(*from_level, *from_exp, *to_level, *to_exp);
        let (gained, status) = if NaiveDate::parse_from_str(to_date, "%Y-%m-%d")?
            - NaiveDate::parse_from_str(from_date, "%Y-%m-%d")?
            != Duration::days(1)
        {
            (None, "missing_snapshot")
        } else {
            match calculation {
                ExpCalculation::Ok(value) => (Some(value), "ok"),
                ExpCalculation::MissingTable => (None, "table_update_required"),
                ExpCalculation::InvalidDecrease => (None, "invalid_decrease"),
                ExpCalculation::Overflow => (None, "overflow"),
            }
        };
        connection.execute(
            r#"INSERT INTO xp_deltas(character_id, date, from_date, gained_exp, table_version, status)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(character_id, date) DO UPDATE SET
                 from_date=excluded.from_date, gained_exp=excluded.gained_exp,
                 table_version=excluded.table_version, status=excluded.status"#,
            params![character_id, to_date, from_date, gained, exp::EXP_TABLE_VERSION, status],
        )?;
    }
    Ok(())
}

pub fn app_status(connection: &Connection) -> Result<AppStatus, AppError> {
    let primary_name = get_setting(connection, "primary_name")?;
    let latest_date = connection.query_row("SELECT MAX(date) FROM daily_snapshots", [], |row| {
        row.get::<_, Option<String>>(0)
    })?;
    let last_sync_at = connection
        .query_row(
            "SELECT finished_at FROM sync_runs WHERE status='success' ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(AppStatus {
        configured: primary_name.is_some(),
        primary_name,
        world_name: get_setting(connection, "world_name")?,
        guild_name: get_setting(connection, "guild_name")?,
        latest_date,
        last_sync_at,
    })
}

fn period_dates(latest: &str, period: &str) -> Result<(String, String), AppError> {
    let end = NaiveDate::parse_from_str(latest, "%Y-%m-%d")?;
    if let Some(raw) = period.strip_prefix("custom:") {
        let mut parts = raw.split(':');
        let start = parts
            .next()
            .ok_or_else(|| AppError::Validation("시작일이 없습니다.".into()))?;
        let finish = parts
            .next()
            .ok_or_else(|| AppError::Validation("종료일이 없습니다.".into()))?;
        NaiveDate::parse_from_str(start, "%Y-%m-%d")?;
        NaiveDate::parse_from_str(finish, "%Y-%m-%d")?;
        if start > finish || parts.next().is_some() {
            return Err(AppError::Validation("날짜 범위를 확인해 주세요.".into()));
        }
        return Ok((start.to_string(), finish.to_string()));
    }
    let days = match period {
        "daily" => 1,
        "30d" => 30,
        _ => 7,
    };
    Ok((
        (end - Duration::days(days - 1))
            .format("%Y-%m-%d")
            .to_string(),
        latest.to_string(),
    ))
}

pub fn dashboard(connection: &Connection, period: &str) -> Result<DashboardData, AppError> {
    dashboard_for_date(
        connection,
        period,
        &Utc::now().with_timezone(&Seoul).date_naive().to_string(),
    )
}

fn dashboard_for_date(
    connection: &Connection,
    period: &str,
    today_date: &str,
) -> Result<DashboardData, AppError> {
    let latest: Option<String> =
        connection.query_row("SELECT MAX(date) FROM guild_memberships", [], |row| {
            row.get(0)
        })?;
    let latest_date = latest.clone().unwrap_or_default();
    let (start, end) = period_dates(today_date, period)?;
    let includes_today = start.as_str() <= today_date && end.as_str() >= today_date;
    let expected_days = (NaiveDate::parse_from_str(&end, "%Y-%m-%d")?
        - NaiveDate::parse_from_str(&start, "%Y-%m-%d")?)
    .num_days()
        + 1;
    let primary_id = get_setting(connection, "primary_character_id")?
        .and_then(|value| value.parse::<i64>().ok());

    let mut statement = connection.prepare(
        r#"SELECT c.id, c.current_name, c.character_class, c.image_url,
                  COALESCE((SELECT level FROM daily_snapshots ds WHERE ds.character_id=c.id AND ds.date<=?2 ORDER BY ds.date DESC LIMIT 1), 0),
                  SUM(CASE WHEN xd.status='ok' THEN xd.gained_exp ELSE NULL END),
                  c.is_primary, c.is_favorite,
                  EXISTS(SELECT 1 FROM guild_memberships gm WHERE gm.date=?3 AND gm.character_id=c.id),
                  SUM(CASE WHEN xd.status='ok' THEN 1 ELSE 0 END)
           FROM characters c
           LEFT JOIN xp_deltas xd ON xd.character_id=c.id AND xd.date BETWEEN ?1 AND ?2 AND xd.date<?4
           WHERE c.is_primary=1 OR c.is_favorite=1 OR EXISTS(SELECT 1 FROM guild_memberships gm WHERE gm.date=?3 AND gm.character_id=c.id)
           GROUP BY c.id
           ORDER BY SUM(CASE WHEN xd.status='ok' THEN xd.gained_exp ELSE NULL END) DESC, c.current_name"#,
    )?;
    let raw = statement
        .query_map(params![start, end, latest_date, today_date], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, bool>(6)?,
                row.get::<_, bool>(7)?,
                row.get::<_, bool>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rankings = Vec::with_capacity(raw.len());
    for (index, row) in raw.into_iter().enumerate() {
        let current = current_progress(connection, row.0, today_date)?;
        let (is_hunting, live_updated_at) = live_activity(connection, row.0)?;
        let live_gain = if includes_today {
            current.today_exp
        } else {
            None
        };
        let collected_days = row.9 + i64::from(live_gain.is_some());
        let gained_exp = match (row.5, live_gain) {
            (Some(past), Some(live)) => past.checked_add(live),
            (past, live) => past.or(live),
        };
        let status = if collected_days == 0 {
            "자료 없음".to_string()
        } else if collected_days < expected_days {
            format!("일부 수집 ({collected_days}/{expected_days}일)")
        } else if includes_today && current.estimated {
            "추정".to_string()
        } else {
            "정상".to_string()
        };
        rankings.push(RankingRow {
            character_id: row.0,
            rank: index + 1,
            character_name: row.1,
            character_class: row.2,
            character_image: row.3,
            level: current.level.unwrap_or(row.4),
            current_exp: current.exp,
            gained_exp,
            current_exp_rate: current.rate,
            today_exp: current.today_exp,
            gap_from_primary: None,
            is_primary: row.6,
            is_favorite: row.7,
            is_current_member: row.8,
            status,
            is_hunting,
            live_updated_at,
        });
    }
    rankings.sort_by(|left, right| {
        right
            .gained_exp
            .cmp(&left.gained_exp)
            .then_with(|| crate::models::compare_current_position(left, right))
    });
    for (index, row) in rankings.iter_mut().enumerate() {
        row.rank = index + 1;
    }
    let primary_exp = rankings
        .iter()
        .find(|row| Some(row.character_id) == primary_id)
        .and_then(|row| row.gained_exp);
    let primary_position = rankings
        .iter()
        .find(|row| row.is_primary)
        .and_then(|row| row.current_exp.map(|value| (row.level, value)));
    if let Some((primary_level, primary_current_exp)) = primary_position {
        for row in &mut rankings {
            row.gap_from_primary = row.current_exp.and_then(|target_exp| {
                match exp::calculate_progress_gap(
                    primary_level,
                    primary_current_exp,
                    row.level,
                    target_exp,
                ) {
                    ExpCalculation::Ok(value) => Some(value),
                    _ => None,
                }
            });
        }
    }
    let primary_rank = rankings
        .iter()
        .filter(|row| row.is_current_member)
        .position(|row| row.is_primary)
        .map(|index| index + 1);
    let primary_current_exp_rate = rankings
        .iter()
        .find(|row| row.is_primary)
        .and_then(|row| row.current_exp_rate);
    let primary_today_exp = rankings
        .iter()
        .find(|row| row.is_primary)
        .and_then(|row| row.today_exp);
    let leader_gap = match (
        rankings
            .iter()
            .find(|row| row.is_current_member)
            .and_then(|row| row.gained_exp),
        primary_exp,
    ) {
        (Some(leader), Some(primary)) => Some(leader - primary),
        _ => None,
    };
    let primary_daily_exp = if period == "daily" {
        primary_today_exp
    } else {
        primary_id.and_then(|id| {
            connection.query_row(
            "SELECT gained_exp FROM xp_deltas WHERE character_id=?1 AND date=?2 AND status='ok'",
            params![id, latest_date], |row| row.get(0)).optional().ok().flatten()
        })
    };

    let mut selected_ids: Vec<i64> = rankings
        .iter()
        .filter(|row| row.is_primary)
        .map(|row| row.character_id)
        .collect();
    for character_id in rankings
        .iter()
        .filter(|row| row.is_favorite && !row.is_primary)
        .map(|row| row.character_id)
    {
        if selected_ids.len() >= 8 {
            break;
        }
        selected_ids.push(character_id);
    }
    let mut series = Vec::new();
    for id in selected_ids {
        let name = rankings
            .iter()
            .find(|row| row.character_id == id)
            .map(|row| row.character_name.clone())
            .unwrap_or_default();
        let mut series_statement = connection.prepare(
            "SELECT ds.date, CASE WHEN xd.status='ok' THEN xd.gained_exp ELSE NULL END, ds.level, ds.exp_rate
             FROM daily_snapshots ds
             LEFT JOIN xp_deltas xd ON ds.character_id=xd.character_id AND ds.date=xd.date
             WHERE ds.character_id=?1 AND ds.date BETWEEN ?2 AND ?3 AND ds.date<?4
             ORDER BY ds.date",
        )?;
        for point in series_statement.query_map(params![id, start, end, today_date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })? {
            let (date, gained_exp, level, exp_rate) = point?;
            series.push(SeriesPoint {
                date,
                character_id: id,
                character_name: name.clone(),
                gained_exp,
                level,
                exp_rate: exp_rate.and_then(|value| value.parse::<f64>().ok()),
            });
        }
        if includes_today
            && !series
                .iter()
                .any(|point| point.character_id == id && point.date == today_date)
        {
            if let Some(today) =
                rankings
                    .iter()
                    .find(|row| row.character_id == id)
                    .and_then(|row| {
                        row.today_exp
                            .map(|today_exp| (today_exp, row.level, row.current_exp_rate))
                    })
            {
                series.push(SeriesPoint {
                    date: today_date.to_string(),
                    character_id: id,
                    character_name: name.clone(),
                    gained_exp: Some(today.0),
                    level: Some(today.1),
                    exp_rate: today.2,
                });
            }
        }
        // 빠진 날짜도 빈 점으로 유지해 그래프와 주간 위젯이 오래된 날짜로 빈칸을 채우지 않습니다.
        let period_start = NaiveDate::parse_from_str(&start, "%Y-%m-%d")?;
        for offset in 0..expected_days {
            let date = (period_start + Duration::days(offset)).to_string();
            if !series
                .iter()
                .any(|point| point.character_id == id && point.date == date)
            {
                series.push(SeriesPoint {
                    date,
                    character_id: id,
                    character_name: name.clone(),
                    gained_exp: None,
                    level: None,
                    exp_rate: None,
                });
            }
        }
    }
    series.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| left.character_id.cmp(&right.character_id))
    });
    let last_sync_at = connection
        .query_row(
            "SELECT finished_at FROM sync_runs WHERE status='success' ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(DashboardData {
        summary: DashboardSummary {
            latest_date: latest,
            period_start: Some(start),
            period_end: Some(end),
            primary_daily_exp,
            primary_period_exp: primary_exp,
            primary_current_exp_rate,
            primary_today_exp,
            primary_rank,
            leader_gap,
            last_sync_at,
        },
        rankings,
        series,
    })
}

pub fn set_favorite(
    connection: &Connection,
    character_id: i64,
    favorite: bool,
) -> Result<(), AppError> {
    connection.execute(
        "UPDATE characters SET is_favorite=CASE WHEN is_primary=1 THEN 1 ELSE ?2 END, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![character_id, favorite as i64],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn add_daily(connection: &Connection, id: i64, date: &str, exp: i64) {
        save_snapshot(
            connection,
            &Snapshot {
                character_id: id,
                date: date.into(),
                level: 281,
                exp,
                exp_rate: "10.000".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        )
        .unwrap();
    }

    fn add_live(connection: &Connection, id: i64, at: &str, exp: i64) {
        connection.execute("INSERT INTO live_snapshots(character_id,fetched_at,level,exp,exp_rate,raw_json) VALUES (?1,?2,281,?3,'10.000','{}')",
            params![id, at, exp]).unwrap();
    }

    fn test_character(connection: &Connection) {
        connection.execute("INSERT INTO characters(id,current_name,world_name,is_primary,is_favorite) VALUES (1,'대표','스카니아',1,1)", []).unwrap();
        set_setting(connection, "primary_character_id", "1").unwrap();
    }

    #[test]
    fn missing_day_is_not_a_daily_gain_and_is_repaired_after_backfill() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        add_daily(&connection, 1, "2026-09-01", 100);
        add_daily(&connection, 1, "2026-09-03", 600);
        recalculate_character(&connection, 1).unwrap();
        let result: (Option<i64>, String) = connection
            .query_row(
                "SELECT gained_exp,status FROM xp_deltas WHERE date='2026-09-03'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(result, (None, "missing_snapshot".into()));
        // 기존 버전에서 생성한 잘못된 파생값도 재시작 시 무효화되어야 합니다.
        connection
            .execute("UPDATE xp_deltas SET gained_exp=500,status='ok'", [])
            .unwrap();
        migrate(&connection).unwrap();
        assert_eq!(
            connection
                .query_row("SELECT gained_exp FROM xp_deltas", [], |row| row
                    .get::<_, Option<i64>>(0))
                .unwrap(),
            None
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM daily_snapshots", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
        add_daily(&connection, 1, "2026-09-02", 300);
        recalculate_character(&connection, 1).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT SUM(gained_exp) FROM xp_deltas WHERE status='ok'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            500
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT gained_exp FROM xp_deltas WHERE date='2026-09-03'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            300
        );
    }

    #[test]
    fn midnight_estimate_is_corrected_by_official_yesterday_without_using_old_guild_date() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        add_daily(&connection, 1, "2026-09-01", 100);
        connection.execute("INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-09-01','대표',1)", []).unwrap();
        // KST 9월 5일 00:00은 UTC 9월 4일 15:00입니다.
        add_live(&connection, 1, "2026-09-04 14:58:00", 1000);
        add_live(&connection, 1, "2026-09-04 15:05:00", 1100);
        add_live(&connection, 1, "2026-09-04 15:30:00", 1500);
        let estimate = current_progress(&connection, 1, "2026-09-05").unwrap();
        assert_eq!(estimate.today_exp, Some(500));
        assert!(estimate.estimated);
        assert_eq!(
            dashboard_for_date(&connection, "daily", "2026-09-05")
                .unwrap()
                .rankings[0]
                .status,
            "추정"
        );
        add_daily(&connection, 1, "2026-09-04", 1200);
        let official = current_progress(&connection, 1, "2026-09-05").unwrap();
        assert_eq!(official.today_exp, Some(300));
        assert!(!official.estimated);
        assert_eq!(
            dashboard_for_date(&connection, "daily", "2026-09-05")
                .unwrap()
                .summary
                .primary_today_exp,
            Some(300)
        );
    }

    #[test]
    fn first_observation_after_midnight_is_a_zero_estimate_and_stale_data_is_not_today() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        add_live(&connection, 1, "2026-09-03 12:00:00", 100);
        assert_eq!(
            current_progress(&connection, 1, "2026-09-05")
                .unwrap()
                .today_exp,
            None
        );
        add_live(&connection, 1, "2026-09-04 15:10:00", 500);
        assert_eq!(
            current_progress(&connection, 1, "2026-09-05")
                .unwrap()
                .today_exp,
            Some(0)
        );
        add_live(&connection, 1, "2026-09-04 15:20:00", 600);
        assert_eq!(
            current_progress(&connection, 1, "2026-09-05")
                .unwrap()
                .today_exp,
            Some(100)
        );
    }

    #[test]
    fn rolling_periods_include_today_and_custom_history_never_appends_today() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        let end = NaiveDate::from_ymd_opt(2026, 9, 5).unwrap();
        for offset in 0..31 {
            add_daily(
                &connection,
                1,
                &(end - Duration::days(31 - offset)).to_string(),
                100 + offset * 100,
            );
        }
        recalculate_character(&connection, 1).unwrap();
        add_live(&connection, 1, "2026-09-05 01:00:00", 3150);
        for (period, days, gain) in [("7d", 7, 650), ("30d", 30, 2950)] {
            let data = dashboard_for_date(&connection, period, "2026-09-05").unwrap();
            assert_eq!(data.series.len(), days);
            assert_eq!(data.series.last().unwrap().date, "2026-09-05");
            assert_eq!(data.rankings[0].gained_exp, Some(gain));
            assert_eq!(
                data.series
                    .iter()
                    .filter_map(|point| point.gained_exp)
                    .sum::<i64>(),
                gain
            );
            assert_eq!(data.rankings[0].status, "정상");
        }
        let custom =
            dashboard_for_date(&connection, "custom:2026-09-01:2026-09-03", "2026-09-05").unwrap();
        assert_eq!(custom.series.len(), 3);
        assert!(custom
            .series
            .iter()
            .all(|point| point.date.as_str() <= "2026-09-03"));
        assert_eq!(custom.rankings[0].gained_exp, Some(300));
        assert!(period_dates("2026-09-05", "custom:2026-09-03:2026-09-01").is_err());
    }

    #[test]
    fn partial_collection_is_labelled_and_widget_keeps_seven_calendar_dates() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        add_daily(&connection, 1, "2026-08-01", 10);
        add_daily(&connection, 1, "2026-09-03", 100);
        add_daily(&connection, 1, "2026-09-04", 200);
        recalculate_character(&connection, 1).unwrap();
        add_live(&connection, 1, "2026-09-05 01:00:00", 200);
        let data = dashboard_for_date(&connection, "7d", "2026-09-05").unwrap();
        assert_eq!(data.rankings[0].status, "일부 수집 (2/7일)");
        let widget = mobile_widget_snapshot_for_date(&connection, "2026-09-05").unwrap();
        assert_eq!(
            serde_json::to_value(&widget).unwrap(),
            serde_json::to_value(data.mobile_widget_snapshot()).unwrap()
        );
        assert_eq!(widget.primary_weekly_points.len(), 7);
        assert_eq!(widget.primary_weekly_points[0].date, "2026-08-30");
        assert_eq!(
            widget.primary_weekly_points.last().unwrap().gained_exp,
            Some(0)
        );
        assert_eq!(widget.primary_daily_average_exp, Some(50));
    }

    #[test]
    fn equal_gains_use_current_exp_and_external_favorites_do_not_change_guild_summary() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        test_character(&connection);
        connection.execute("INSERT INTO characters(id,current_name,world_name,is_favorite) VALUES (2,'가','스카니아',1),(3,'외부','루나',1)", []).unwrap();
        connection.execute("INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-09-04','대표',1),('2026-09-04','가',2)", []).unwrap();
        for (id, past, live) in [(1, 100, 200), (2, 200, 300), (3, 100, 1000)] {
            add_daily(&connection, id, "2026-09-04", past);
            add_live(&connection, id, "2026-09-05 01:00:00", live);
        }
        let data = dashboard_for_date(&connection, "daily", "2026-09-05").unwrap();
        assert_eq!(
            data.rankings
                .iter()
                .map(|row| row.character_id)
                .collect::<Vec<_>>(),
            vec![3, 2, 1]
        );
        assert_eq!(data.summary.primary_rank, Some(2));
        assert_eq!(data.summary.leader_gap, Some(0));
        let widget = mobile_widget_snapshot_for_date(&connection, "2026-09-05").unwrap();
        assert_eq!(
            widget
                .characters
                .iter()
                .map(|row| row.character_id)
                .collect::<Vec<_>>(),
            vec![3, 2, 1]
        );
    }

    #[test]
    fn migration_and_settings_round_trip() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        set_setting(&connection, "guild_name", "테스트길드").unwrap();
        assert_eq!(
            get_setting(&connection, "guild_name").unwrap().as_deref(),
            Some("테스트길드")
        );
    }

    #[test]
    fn migration_adds_character_image_column_to_existing_database() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        connection
            .execute_batch(
                r#"CREATE TABLE characters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    current_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    world_name TEXT NOT NULL,
                    character_class TEXT NOT NULL DEFAULT '',
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );"#,
            )
            .unwrap();
        migrate(&connection).unwrap();
        let columns = connection
            .prepare("PRAGMA table_info(characters)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(columns.iter().any(|column| column == "image_url"));
    }

    #[test]
    fn mobile_widget_snapshot_uses_only_primary_and_favorites() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute_batch(
            r#"INSERT INTO characters(id,current_name,world_name,character_class,is_primary,is_favorite)
               VALUES (1,'대표','스카니아','은월',1,1),(2,'즐겨찾기','스카니아','비숍',0,1),(3,'일반','스카니아','히어로',0,0);
               INSERT INTO character_identities(character_id,ocid) VALUES (1,'one'),(2,'two'),(3,'three');"#,
        ).unwrap();
        for character_id in 1..=2 {
            save_snapshot(
                &connection,
                &Snapshot {
                    character_id,
                    date: "2026-09-02".into(),
                    level: 281,
                    exp: 100,
                    exp_rate: "10.000".into(),
                    access_flag: None,
                    raw_json: "{}".into(),
                },
            )
            .unwrap();
            save_live_snapshot(
                &connection,
                &Snapshot {
                    character_id,
                    date: String::new(),
                    level: 281,
                    exp: 200 + character_id,
                    exp_rate: "11.000".into(),
                    access_flag: None,
                    raw_json: "{}".into(),
                },
            )
            .unwrap();
        }

        let records = widget_character_records(&connection).unwrap();
        assert_eq!(records.len(), 2);
        connection
            .execute(
                "UPDATE live_snapshots SET fetched_at='2026-09-03 01:00:00'",
                [],
            )
            .unwrap();
        let snapshot = mobile_widget_snapshot_for_date(&connection, "2026-09-03").unwrap();
        assert_eq!(snapshot.characters.len(), 2);
        assert!(snapshot
            .characters
            .iter()
            .any(|character| character.is_primary));
        assert!(!snapshot
            .characters
            .iter()
            .any(|character| character.character_name == "일반"));
        assert_eq!(snapshot.primary_weekly_points.len(), 7);
        assert_eq!(snapshot.primary_weekly_points[0].gained_exp, None);
    }

    #[test]
    fn thirty_one_snapshots_create_thirty_deltas() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        for day in 1..=31 {
            let date = format!("2026-07-{day:02}");
            save_snapshot(
                &connection,
                &Snapshot {
                    character_id: 1,
                    date,
                    level: 260,
                    exp: day * 100,
                    exp_rate: "0".into(),
                    access_flag: None,
                    raw_json: "{}".into(),
                },
            )
            .unwrap();
        }
        recalculate_character(&connection, 1).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM xp_deltas", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 30);
    }

    #[test]
    fn missing_snapshot_jobs_only_returns_uncollected_dates() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        save_snapshot(
            &connection,
            &Snapshot {
                character_id: 1,
                date: "2026-08-18".into(),
                level: 260,
                exp: 100,
                exp_rate: "0".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        )
        .unwrap();
        let jobs = missing_snapshot_jobs(
            &connection,
            &[CharacterRecord {
                id: 1,
                ocid: "ocid".into(),
            }],
            &["2026-08-18".into(), "2026-08-19".into()],
        )
        .unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].1, "2026-08-19");
    }

    #[test]
    fn missing_history_is_not_mistaken_for_completed_sync() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO guild_memberships(date, member_name, character_id) VALUES ('2026-08-18', '테스트', 1), ('2026-08-19', '테스트', 1)", []).unwrap();
        save_snapshot(
            &connection,
            &Snapshot {
                character_id: 1,
                date: "2026-08-19".into(),
                level: 260,
                exp: 100,
                exp_rate: "0".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        )
        .unwrap();
        assert_eq!(
            earliest_missing_snapshot_date(&connection)
                .unwrap()
                .as_deref(),
            Some("2026-08-18")
        );
    }

    #[test]
    fn primary_character_can_change_to_a_current_member() {
        let file = NamedTempFile::new().unwrap();
        let mut connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute("INSERT INTO characters(current_name, world_name, is_primary) VALUES ('기존', '스카니아', 1), ('새대표', '스카니아', 0)", []).unwrap();
        connection.execute("INSERT INTO guild_memberships(date, member_name, character_id) VALUES ('2026-08-19', '기존', 1), ('2026-08-19', '새대표', 2)", []).unwrap();
        set_primary(&mut connection, 2).unwrap();
        assert_eq!(
            get_setting(&connection, "primary_name").unwrap().as_deref(),
            Some("새대표")
        );
        let primary_id: i64 = connection
            .query_row("SELECT id FROM characters WHERE is_primary=1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(primary_id, 2);
    }

    #[test]
    fn any_positive_recent_exp_gain_marks_character_as_hunting() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO live_snapshots(character_id,fetched_at,level,exp,exp_rate,raw_json) VALUES (1,datetime('now','-10 minutes'),281,100,'10.000','{}'),(1,datetime('now'),281,101,'10.001','{}')",
            [],
        ).unwrap();

        assert!(live_activity(&connection, 1).unwrap().0);
    }

    #[test]
    fn unchanged_manual_refresh_keeps_recent_hunting_activity() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO live_snapshots(character_id,fetched_at,level,exp,exp_rate,raw_json) VALUES (1,datetime('now','-15 minutes'),281,100,'10.000','{}'),(1,datetime('now','-5 minutes'),281,200,'10.100','{}'),(1,datetime('now'),281,200,'10.100','{}')",
            [],
        ).unwrap();

        assert!(live_activity(&connection, 1).unwrap().0);
    }

    #[test]
    fn current_progress_uses_api_rate_and_gain_since_completed_date() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO characters(current_name, world_name) VALUES ('테스트', '스카니아')",
                [],
            )
            .unwrap();
        save_snapshot(
            &connection,
            &Snapshot {
                character_id: 1,
                date: "2026-08-21".into(),
                level: 281,
                exp: 100,
                exp_rate: "33.700".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        )
        .unwrap();
        connection.execute(
            "INSERT INTO live_snapshots(character_id,level,exp,exp_rate,raw_json) VALUES (1,281,220,'33.757','{}')",
            [],
        ).unwrap();

        connection
            .execute(
                "UPDATE live_snapshots SET fetched_at='2026-08-22 01:00:00'",
                [],
            )
            .unwrap();
        assert_eq!(
            current_progress(&connection, 1, "2026-08-22").unwrap(),
            CurrentProgress {
                level: Some(281),
                exp: Some(220),
                rate: Some(33.757),
                today_exp: Some(120),
                estimated: false,
            }
        );
    }

    #[test]
    fn dashboard_series_includes_today_live_gain() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute(
            "INSERT INTO characters(id,current_name,world_name,is_primary,is_favorite) VALUES (1,'대표','스카니아',1,1)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-08-21','대표',1)",
            [],
        ).unwrap();
        set_setting(&connection, "primary_character_id", "1").unwrap();
        save_snapshot(
            &connection,
            &Snapshot {
                character_id: 1,
                date: "2026-08-21".into(),
                level: 281,
                exp: 100,
                exp_rate: "33.700".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        )
        .unwrap();
        connection.execute(
            "INSERT INTO live_snapshots(character_id,level,exp,exp_rate,raw_json) VALUES (1,281,220,'33.757','{}')",
            [],
        ).unwrap();

        connection
            .execute(
                "UPDATE live_snapshots SET fetched_at='2026-08-22 01:00:00'",
                [],
            )
            .unwrap();
        let today = "2026-08-22";
        let data = dashboard_for_date(&connection, "daily", today).unwrap();
        assert!(data.series.iter().any(|point| {
            point.character_id == 1 && point.date == today && point.gained_exp == Some(120)
        }));
    }

    #[test]
    fn daily_dashboard_ranks_and_summarizes_by_today_live_gain() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute(
            "INSERT INTO characters(id,current_name,world_name,is_primary,is_favorite) VALUES (1,'대표','스카니아',1,1),(2,'길드원','스카니아',0,0)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-08-21','대표',1),('2026-08-21','길드원',2)",
            [],
        ).unwrap();
        set_setting(&connection, "primary_character_id", "1").unwrap();
        for snapshot in [
            Snapshot {
                character_id: 1,
                date: "2026-08-20".into(),
                level: 281,
                exp: 100,
                exp_rate: "10.000".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
            Snapshot {
                character_id: 1,
                date: "2026-08-21".into(),
                level: 281,
                exp: 1_000,
                exp_rate: "10.900".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
            Snapshot {
                character_id: 2,
                date: "2026-08-20".into(),
                level: 281,
                exp: 100,
                exp_rate: "10.000".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
            Snapshot {
                character_id: 2,
                date: "2026-08-21".into(),
                level: 281,
                exp: 200,
                exp_rate: "10.100".into(),
                access_flag: None,
                raw_json: "{}".into(),
            },
        ] {
            save_snapshot(&connection, &snapshot).unwrap();
        }
        recalculate_character(&connection, 1).unwrap();
        recalculate_character(&connection, 2).unwrap();
        connection.execute(
            "INSERT INTO live_snapshots(character_id,level,exp,exp_rate,raw_json) VALUES (1,281,1010,'10.910','{}'),(2,281,400,'10.300','{}')",
            [],
        ).unwrap();

        connection
            .execute(
                "UPDATE live_snapshots SET fetched_at='2026-08-22 01:00:00'",
                [],
            )
            .unwrap();
        let data = dashboard_for_date(&connection, "daily", "2026-08-22").unwrap();
        assert_eq!(data.rankings[0].character_name, "길드원");
        assert_eq!(data.rankings[0].gained_exp, Some(200));
        assert_eq!(data.rankings[1].gained_exp, Some(10));
        assert_eq!(data.summary.primary_today_exp, Some(10));
        assert_eq!(data.summary.primary_period_exp, Some(10));
        assert_eq!(data.summary.primary_daily_exp, Some(10));
        assert_eq!(data.summary.leader_gap, Some(190));
    }

    #[test]
    fn disabled_external_favorite_is_excluded_from_refreshed_dashboard() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute(
            "INSERT INTO characters(id,current_name,world_name,is_primary,is_favorite) VALUES (1,'대표','스카니아',1,1),(2,'외부','루나',0,1)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-08-21','대표',1)",
            [],
        ).unwrap();
        set_setting(&connection, "primary_character_id", "1").unwrap();
        assert!(dashboard(&connection, "daily")
            .unwrap()
            .rankings
            .iter()
            .any(|row| row.character_id == 2));

        set_favorite(&connection, 2, false).unwrap();

        assert!(!dashboard(&connection, "daily")
            .unwrap()
            .rankings
            .iter()
            .any(|row| row.character_id == 2));
    }

    #[test]
    fn nickname_change_reuses_ocid_and_merges_duplicate_history() {
        let file = NamedTempFile::new().unwrap();
        let connection = open(file.path()).unwrap();
        migrate(&connection).unwrap();
        connection.execute(
            "INSERT INTO characters(id,current_name,world_name) VALUES (1,'이전이름','스카니아'),(2,'새이름','스카니아')",
            [],
        ).unwrap();
        connection
            .execute(
                "INSERT INTO character_identities(character_id,ocid) VALUES (1,'same-ocid')",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO guild_memberships(date,member_name,character_id) VALUES ('2026-08-19','새이름',2)",
            [],
        ).unwrap();
        for (id, date, exp) in [(1, "2026-08-18", 100), (2, "2026-08-19", 200)] {
            save_snapshot(
                &connection,
                &Snapshot {
                    character_id: id,
                    date: date.into(),
                    level: 260,
                    exp,
                    exp_rate: "0".into(),
                    access_flag: None,
                    raw_json: "{}".into(),
                },
            )
            .unwrap();
        }
        let record = upsert_character(
            &connection,
            "새이름",
            "스카니아",
            "은월",
            None,
            "same-ocid",
            false,
        )
        .unwrap();
        assert_eq!(record.id, 1);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM characters", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM daily_snapshots WHERE character_id=1",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
        assert_eq!(
            connection
                .query_row("SELECT character_id FROM guild_memberships", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT current_name FROM characters WHERE id=1",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "새이름"
        );
    }
}
