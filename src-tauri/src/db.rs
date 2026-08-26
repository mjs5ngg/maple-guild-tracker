// SQLite 스키마와 앱 데이터 조회·저장 작업을 제공합니다.
use std::{collections::HashSet, path::Path};

use chrono::{Duration, NaiveDate, Utc};
use chrono_tz::Asia::Seoul;
use rusqlite::{params, Connection, OptionalExtension};

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
            r#"SELECT MIN(gm.date)
           FROM guild_memberships gm
           LEFT JOIN daily_snapshots ds ON ds.character_id=gm.character_id AND ds.date=gm.date
           WHERE gm.character_id IS NOT NULL AND ds.character_id IS NULL"#,
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

pub fn save_live_snapshot(connection: &Connection, snapshot: &Snapshot) -> Result<(), AppError> {
    connection.execute(
        r#"INSERT INTO live_snapshots(character_id, level, exp, exp_rate, raw_json)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(character_id, fetched_at) DO UPDATE SET
             level=excluded.level, exp=excluded.exp, exp_rate=excluded.exp_rate, raw_json=excluded.raw_json"#,
        params![snapshot.character_id, snapshot.level, snapshot.exp, snapshot.exp_rate, snapshot.raw_json],
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
    let latest_at = samples.last().map(|sample| sample.0.clone());
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
}

fn current_progress(
    connection: &Connection,
    character_id: i64,
    completed_date: &str,
) -> Result<CurrentProgress, AppError> {
    let live = connection
        .query_row(
            "SELECT level, exp, exp_rate FROM live_snapshots WHERE character_id=?1 ORDER BY fetched_at DESC LIMIT 1",
            params![character_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?)),
        )
        .optional()?;
    let completed = connection
        .query_row(
            "SELECT level, exp, exp_rate FROM daily_snapshots WHERE character_id=?1 AND date=?2",
            params![character_id, completed_date],
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
    let today_exp = match (&completed, &live) {
        (Some(from), Some(to)) => match exp::calculate_gain(from.0, from.1, to.0, to.1) {
            ExpCalculation::Ok(value) => Some(value),
            _ => None,
        },
        _ => None,
    };
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
    })
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
        let (gained, status) = match calculation {
            ExpCalculation::Ok(value) => (Some(value), "ok"),
            ExpCalculation::MissingTable => (None, "table_update_required"),
            ExpCalculation::InvalidDecrease => (None, "invalid_decrease"),
            ExpCalculation::Overflow => (None, "overflow"),
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
    let latest: Option<String> =
        connection.query_row("SELECT MAX(date) FROM guild_memberships", [], |row| {
            row.get(0)
        })?;
    let Some(latest_date) = latest else {
        return Ok(DashboardData {
            summary: DashboardSummary {
                latest_date: None,
                period_start: None,
                period_end: None,
                primary_daily_exp: None,
                primary_period_exp: None,
                primary_current_exp_rate: None,
                primary_today_exp: None,
                primary_rank: None,
                leader_gap: None,
                last_sync_at: None,
            },
            rankings: vec![],
            series: vec![],
        });
    };
    let (start, end) = period_dates(&latest_date, period)?;
    let primary_id = get_setting(connection, "primary_character_id")?
        .and_then(|value| value.parse::<i64>().ok());

    let mut statement = connection.prepare(
        r#"SELECT c.id, c.current_name, c.character_class, c.image_url,
                  COALESCE((SELECT level FROM daily_snapshots ds WHERE ds.character_id=c.id AND ds.date<=?2 ORDER BY ds.date DESC LIMIT 1), 0),
                  SUM(CASE WHEN xd.status='ok' THEN xd.gained_exp ELSE NULL END),
                  c.is_primary, c.is_favorite,
                  EXISTS(SELECT 1 FROM guild_memberships gm WHERE gm.date=?2 AND gm.character_id=c.id),
                  CASE
                    WHEN SUM(CASE WHEN xd.status='ok' THEN 1 ELSE 0 END)>0 THEN '정상'
                    WHEN EXISTS(SELECT 1 FROM daily_snapshots ds WHERE ds.character_id=c.id) THEN '기준점 수집됨'
                    ELSE '자료 없음'
                  END
           FROM characters c
           LEFT JOIN xp_deltas xd ON xd.character_id=c.id AND xd.date BETWEEN ?1 AND ?2
           WHERE c.is_favorite=1 OR EXISTS(SELECT 1 FROM guild_memberships gm WHERE gm.date=?2 AND gm.character_id=c.id)
           GROUP BY c.id
           ORDER BY SUM(CASE WHEN xd.status='ok' THEN xd.gained_exp ELSE NULL END) DESC, c.current_name"#,
    )?;
    let raw = statement
        .query_map(params![start, end], |row| {
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
                row.get::<_, String>(9)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rankings = Vec::with_capacity(raw.len());
    for (index, row) in raw.into_iter().enumerate() {
        let current = current_progress(connection, row.0, &latest_date)?;
        let (is_hunting, live_updated_at) = live_activity(connection, row.0)?;
        rankings.push(RankingRow {
            character_id: row.0,
            rank: index + 1,
            character_name: row.1,
            character_class: row.2,
            character_image: row.3,
            level: current.level.unwrap_or(row.4),
            current_exp: current.exp,
            gained_exp: row.5,
            current_exp_rate: current.rate,
            today_exp: current.today_exp,
            gap_from_primary: None,
            is_primary: row.6,
            is_favorite: row.7,
            is_current_member: row.8,
            status: row.9,
            is_hunting,
            live_updated_at,
        });
    }
    if period == "daily" {
        for row in &mut rankings {
            row.gained_exp = row.today_exp;
        }
        rankings.sort_by(|left, right| {
            right
                .gained_exp
                .unwrap_or(-1)
                .cmp(&left.gained_exp.unwrap_or(-1))
                .then_with(|| left.character_name.cmp(&right.character_name))
        });
        for (index, row) in rankings.iter_mut().enumerate() {
            row.rank = index + 1;
        }
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
        .find(|row| row.is_primary)
        .map(|row| row.rank);
    let primary_current_exp_rate = rankings
        .iter()
        .find(|row| row.is_primary)
        .and_then(|row| row.current_exp_rate);
    let primary_today_exp = rankings
        .iter()
        .find(|row| row.is_primary)
        .and_then(|row| row.today_exp);
    let leader_gap = match (rankings.first().and_then(|row| row.gained_exp), primary_exp) {
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

    let selected_ids: Vec<i64> = rankings
        .iter()
        .filter(|row| row.is_primary || row.is_favorite)
        .take(8)
        .map(|row| row.character_id)
        .collect();
    let today_date = Utc::now()
        .with_timezone(&Seoul)
        .format("%Y-%m-%d")
        .to_string();
    let mut series = Vec::new();
    for id in selected_ids {
        let name = rankings
            .iter()
            .find(|row| row.character_id == id)
            .map(|row| row.character_name.clone())
            .unwrap_or_default();
        let mut series_statement = connection.prepare(
            "SELECT date, gained_exp FROM xp_deltas WHERE character_id=?1 AND date BETWEEN ?2 AND ?3 ORDER BY date",
        )?;
        for point in series_statement.query_map(params![id, start, end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })? {
            let (date, gained_exp) = point?;
            series.push(SeriesPoint {
                date,
                character_id: id,
                character_name: name.clone(),
                gained_exp,
            });
        }
        if !series
            .iter()
            .any(|point| point.character_id == id && point.date == today_date)
        {
            if let Some(today_exp) = rankings
                .iter()
                .find(|row| row.character_id == id)
                .and_then(|row| row.today_exp)
            {
                series.push(SeriesPoint {
                    date: today_date.clone(),
                    character_id: id,
                    character_name: name,
                    gained_exp: Some(today_exp),
                });
            }
        }
    }
    let last_sync_at = connection
        .query_row(
            "SELECT finished_at FROM sync_runs WHERE status='success' ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(DashboardData {
        summary: DashboardSummary {
            latest_date: Some(latest_date),
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

        assert_eq!(
            current_progress(&connection, 1, "2026-08-21").unwrap(),
            CurrentProgress {
                level: Some(281),
                exp: Some(220),
                rate: Some(33.757),
                today_exp: Some(120),
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

        let today = Utc::now()
            .with_timezone(&Seoul)
            .format("%Y-%m-%d")
            .to_string();
        let data = dashboard(&connection, "daily").unwrap();
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

        let data = dashboard(&connection, "daily").unwrap();
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
