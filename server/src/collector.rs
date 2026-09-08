// 운영자 키로 활성 사용자의 중복 제거 대상을 수집하고 과거 누락일을 보충합니다.
use crate::*;
use chrono::{Duration as Days, Timelike, Utc};
use serde_json::Value;
use sqlx::{Connection, Row};
use std::collections::HashMap;

pub(crate) async fn api(app: &App, path: &str, params: &[(&str, &str)]) -> Result<Value, ()> {
    #[cfg(test)]
    let base = app.nexon_origin.as_str();
    #[cfg(not(test))]
    let base = "https://open.api.nexon.com";
    for attempt in 0..4 {
        // 직렬 수집과 호출 간격으로 동시 실행·순간 호출량을 제한합니다.
        tokio::time::sleep(Duration::from_millis(if cfg!(test) { 1 } else { 220 })).await;
        let response = app
            .http
            .get(format!("{base}/maplestory/v1/{path}"))
            .header("x-nxopen-api-key", app.operator_key.as_deref().ok_or(())?)
            .query(params)
            .send()
            .await;
        let response = match response {
            Ok(response) => response,
            Err(_) => {
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_millis(500u64 << attempt)).await;
                    continue;
                }
                return Err(());
            }
        };
        if response.status().is_success() {
            return response.json().await.map_err(|_| ());
        }
        if response.status() == StatusCode::TOO_MANY_REQUESTS || response.status().is_server_error()
        {
            tokio::time::sleep(Duration::from_millis(
                (500u64 << attempt) + (Utc::now().timestamp_subsec_millis() as u64 % 300),
            ))
            .await;
        } else {
            return Err(());
        }
    }
    Err(())
}
async fn current(app: &App, name: &str) -> Result<(String, Value), ()> {
    let known: Option<String> = sqlx::query_scalar("SELECT ocid FROM characters WHERE name=$1")
        .bind(name)
        .fetch_optional(app.pool().map_err(|_| ())?)
        .await
        .map_err(|_| ())?;
    let ocid = if let Some(id) = known {
        id
    } else {
        api(app, "id", &[("character_name", name)]).await?["ocid"]
            .as_str()
            .ok_or(())?
            .to_owned()
    };
    let basic = api(app, "character/basic", &[("ocid", &ocid)]).await?;
    let observed = Utc::now();
    records::save_current(app.pool().map_err(|_| ())?, &ocid, &basic, observed)
        .await
        .map_err(|_| ())?;
    Ok((ocid, basic))
}
async fn guild(
    app: &App,
    ocid: &str,
    basic: &Value,
    cache: &mut HashMap<(String, String), String>,
) -> Result<(), ()> {
    let pool = app.pool().map_err(|_| ())?;
    let name = basic["character_guild_name"].as_str().unwrap_or("");
    if name.is_empty() {
        sqlx::query("UPDATE characters SET guild_key=NULL WHERE ocid=$1")
            .bind(ocid)
            .execute(pool)
            .await
            .map_err(|_| ())?;
        return Ok(());
    }
    let world = basic["world_name"].as_str().ok_or(())?;
    let cache_key = (world.to_owned(), name.to_owned());
    if let Some(id) = cache.get(&cache_key) {
        sqlx::query("UPDATE characters SET guild_key=$1 WHERE ocid=$2")
            .bind(id)
            .bind(ocid)
            .execute(pool)
            .await
            .map_err(|_| ())?;
        return Ok(());
    }
    let id = api(
        app,
        "guild/id",
        &[("guild_name", name), ("world_name", world)],
    )
    .await?["oguild_id"]
        .as_str()
        .ok_or(())?
        .to_owned();
    let list = api(app, "guild/basic", &[("oguild_id", &id)]).await?;
    let members = list["guild_member"].as_array().ok_or(())?;
    let mut tx = pool.begin().await.map_err(|_| ())?;
    sqlx::query("INSERT INTO guilds VALUES($1,$2,$3,now()) ON CONFLICT(guild_key) DO UPDATE SET observed_at=now()").bind(&id).bind(world).bind(name).execute(&mut *tx).await.map_err(|_|())?;
    sqlx::query("DELETE FROM guild_members WHERE guild_key=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ())?;
    for member in members {
        sqlx::query("INSERT INTO guild_members VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(&id)
            .bind(member.as_str().ok_or(())?)
            .execute(&mut *tx)
            .await
            .map_err(|_| ())?;
    }
    sqlx::query("UPDATE characters SET guild_key=$1 WHERE ocid=$2")
        .bind(&id)
        .bind(ocid)
        .execute(&mut *tx)
        .await
        .map_err(|_| ())?;
    tx.commit().await.map_err(|_| ())?;
    cache.insert(cache_key, id);
    Ok(())
}
pub(crate) async fn cycle(app: &App) -> Result<(), sqlx::Error> {
    let pool = app.db.as_ref().unwrap();
    // 전용 연결의 잠금으로 여러 서버 프로세스의 중복 수집을 방지합니다.
    let mut lock = pool.acquire().await?.detach();
    let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(7420913)")
        .fetch_one(&mut lock)
        .await?;
    if !acquired {
        return Ok(());
    }
    let result = async {
        sqlx::query(
            "UPDATE sync_runs SET finished_at=now(),status='interrupted' WHERE finished_at IS NULL",
        )
        .execute(&mut lock)
        .await?;
        cycle_locked(app).await
    }
    .await;
    if result.is_err() {
        let _=sqlx::query("UPDATE sync_runs SET finished_at=now(),status='storage_error' WHERE finished_at IS NULL").execute(&mut lock).await;
    }
    let unlocked = sqlx::query("SELECT pg_advisory_unlock(7420913)")
        .execute(&mut lock)
        .await;
    if unlocked.is_err() {
        let _ = lock.close().await;
    }
    result
}
async fn cycle_locked(app: &App) -> Result<(), sqlx::Error> {
    let pool = app.db.as_ref().unwrap();
    let run: i64 = sqlx::query_scalar("INSERT INTO sync_runs DEFAULT VALUES RETURNING id")
        .fetch_one(pool)
        .await?;
    let primaries: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT primary_name FROM users WHERE last_active>now()-interval '168 hours'",
    )
    .fetch_all(pool)
    .await?;
    let mut basics = HashMap::new();
    let mut guild_cache = HashMap::new();
    let mut failed = 0i32;
    let mut succeeded = 0i32;
    for primary in primaries {
        if primary.is_empty() || basics.contains_key(&primary) {
            continue;
        }
        match current(app, &primary).await {
            Ok((ocid, basic)) => {
                if guild(app, &ocid, &basic, &mut guild_cache).await.is_err() {
                    failed += 1;
                }
                // 저장 중 바뀐 새 이름으로도 같은 응답을 재사용합니다.
                let value = Ok((ocid, basic));
                if let Ok((_, basic)) = &value {
                    if let Some(name) = basic["character_name"].as_str() {
                        basics.insert(name.to_owned(), value.clone());
                    }
                }
                basics.insert(primary, value);
            }
            Err(_) => {
                basics.insert(primary, Err(()));
            }
        }
    }
    // 대표 저장 과정의 닉네임 변경을 반영한 뒤 구독 합집합을 계산합니다.
    let rows=sqlx::query("SELECT id,last_active,primary_name FROM users WHERE last_active>now()-interval '168 hours'").fetch_all(pool).await?;
    let mut users = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        let favorites: Vec<String> =
            sqlx::query_scalar("SELECT name FROM favorites WHERE user_id=$1")
                .bind(id)
                .fetch_all(pool)
                .await?;
        users.push((row.get("last_active"), row.get("primary_name"), favorites));
    }
    let mut guild_of = HashMap::new();
    let mut members: HashMap<String, Vec<String>> = HashMap::new();
    for row in sqlx::query("SELECT name,guild_key FROM characters WHERE guild_key IS NOT NULL")
        .fetch_all(pool)
        .await?
    {
        guild_of.insert(row.get("name"), row.get("guild_key"));
    }
    for row in sqlx::query("SELECT guild_key,name FROM guild_members")
        .fetch_all(pool)
        .await?
    {
        members
            .entry(row.get("guild_key"))
            .or_default()
            .push(row.get("name"));
    }
    let targets = policy::targets(&users, &guild_of, &members, Utc::now());
    let mut collected = Vec::new();
    for name in targets {
        let result = if let Some(value) = basics.get(&name) {
            value.clone()
        } else {
            current(app, &name).await
        };
        match result {
            Ok((ocid, _)) => {
                succeeded += 1;
                collected.push(ocid);
            }
            Err(_) => failed += 1,
        }
    }
    // 최신 수집을 먼저 끝내고, 과거 보충은 한 주기당 제한하여 신규 길드가 최신화를 막지 않게 합니다.
    let now = Utc::now().with_timezone(&chrono_tz::Asia::Seoul);
    let end = now.date_naive() - Days::days(if now.hour() >= 2 { 1 } else { 2 });
    let start = now.date_naive() - Days::days(30);
    let mut active_guilds: Vec<String> = guild_cache.values().cloned().collect();
    active_guilds.sort();
    active_guilds.dedup();
    failed += crate::guild_history::collect(app, &active_guilds, start, end).await?;
    backfill::enqueue(pool, &collected, start, end).await?;
    let jobs = backfill::due(pool, &collected, start, Utc::now(), 300).await?;
    for (ocid, date, attempts) in jobs {
        let date_string = date.to_string();
        match api(
            app,
            "character/basic",
            &[("ocid", &ocid), ("date", &date_string)],
        )
        .await
        {
            Ok(basic) => backfill::complete(pool, &ocid, date, &basic).await?,
            Err(_) => {
                failed += 1;
                backfill::failed(pool, &ocid, date, attempts, Utc::now()).await?;
            }
        }
    }
    sqlx::query("UPDATE sync_runs SET finished_at=now(),succeeded=$1,failed=$2,status=CASE WHEN $2>0 THEN 'partial' ELSE 'completed' END WHERE id=$3")
        .bind(succeeded)
        .bind(failed)
        .bind(run)
        .execute(pool)
        .await?;
    Ok(())
}
pub async fn run(app: Arc<App>) {
    let mut timer = tokio::time::interval(Duration::from_secs(policy::INTERVAL_SECONDS));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        timer.tick().await;
        if cycle(&app).await.is_err() {
            eprintln!("공용 수집 저장 작업 실패. 다음 주기에 재시도합니다.");
        }
    }
}
