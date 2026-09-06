// 운영자 키로 활성 사용자의 중복 제거 대상을 수집하고 과거 누락일을 보충합니다.
use crate::*;
use chrono::{Duration as Days, Timelike, Utc};
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;

async fn api(app: &App, path: &str, params: &[(&str, &str)]) -> Result<Value, ()> {
    for attempt in 0..4 {
        // 직렬 수집과 호출 간격으로 동시 실행·순간 호출량을 제한합니다.
        tokio::time::sleep(Duration::from_millis(220)).await;
        let response = app
            .http
            .get(format!("https://open.api.nexon.com/maplestory/v1/{path}"))
            .header("x-nxopen-api-key", app.operator_key.as_deref().ok_or(())?)
            .query(params)
            .send()
            .await
            .map_err(|_| ())?;
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
    sqlx::query("INSERT INTO characters(ocid,name,basic,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT(ocid) DO UPDATE SET name=excluded.name,basic=excluded.basic,observed_at=excluded.observed_at")
        .bind(&ocid).bind(basic["character_name"].as_str().ok_or(())?).bind(&basic).bind(observed).execute(app.pool().map_err(|_|())?).await.map_err(|_|())?;
    sqlx::query("INSERT INTO observations VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(&ocid)
        .bind(observed)
        .bind(&basic)
        .execute(app.pool().map_err(|_| ())?)
        .await
        .map_err(|_| ())?;
    Ok((ocid, basic))
}
async fn guild(app: &App, ocid: &str, basic: &Value) -> Result<(), ()> {
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
        .bind(id)
        .bind(ocid)
        .execute(&mut *tx)
        .await
        .map_err(|_| ())?;
    tx.commit().await.map_err(|_| ())?;
    Ok(())
}
async fn cycle(app: &App) -> Result<(), sqlx::Error> {
    let pool = app.db.as_ref().unwrap();
    // 전용 연결의 잠금으로 여러 서버 프로세스의 중복 수집을 방지합니다.
    let mut lock = pool.acquire().await?;
    let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(7420913)")
        .fetch_one(&mut *lock)
        .await?;
    if !acquired {
        return Ok(());
    }
    let result = cycle_locked(app).await;
    let unlocked = sqlx::query("SELECT pg_advisory_unlock(7420913)")
        .execute(&mut *lock)
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
    let rows=sqlx::query("SELECT id,last_active,primary_name FROM users WHERE last_active>now()-interval '168 hours'").fetch_all(pool).await?;
    let mut users = Vec::new();
    let mut basics = HashMap::new();
    let mut failed = 0i32;
    let mut succeeded = 0i32;
    for row in rows {
        let id: String = row.get("id");
        let primary: String = row.get("primary_name");
        let favorites: Vec<String> =
            sqlx::query_scalar("SELECT name FROM favorites WHERE user_id=$1")
                .bind(id)
                .fetch_all(pool)
                .await?;
        users.push((row.get("last_active"), primary.clone(), favorites));
        if primary.is_empty() || basics.contains_key(&primary) {
            continue;
        }
        match current(app, &primary).await {
            Ok((ocid, basic)) => {
                if guild(app, &ocid, &basic).await.is_err() {
                    failed += 1;
                }
                basics.insert(primary, (ocid, basic));
            }
            Err(_) => failed += 1,
        }
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
        let result = if let Some(value) = basics.remove(&name) {
            Ok(value)
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
    let mut budget = 300usize;
    for ocid in collected {
        for offset in 0..31 {
            if budget == 0 {
                break;
            }
            let date = end - Days::days(offset);
            if date < now.date_naive() - Days::days(30) {
                continue;
            }
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM daily_snapshots WHERE ocid=$1 AND date=$2)",
            )
            .bind(&ocid)
            .bind(date)
            .fetch_one(pool)
            .await?;
            if exists {
                continue;
            }
            budget -= 1;
            let date_string = date.to_string();
            match api(
                app,
                "character/basic",
                &[("ocid", &ocid), ("date", &date_string)],
            )
            .await
            {
                Ok(basic) => {
                    sqlx::query(
                        "INSERT INTO daily_snapshots VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                    )
                    .bind(&ocid)
                    .bind(date)
                    .bind(basic)
                    .execute(pool)
                    .await?;
                }
                Err(_) => failed += 1,
            }
        }
    }
    sqlx::query("UPDATE sync_runs SET finished_at=now(),succeeded=$1,failed=$2 WHERE id=$3")
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
