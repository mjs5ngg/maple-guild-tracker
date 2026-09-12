// 활성 구독을 Cloudflare에서 받고 정규화 변경분을 단일 outbox로 서명 전송합니다.
use crate::*;
use chrono::{TimeZone, Utc};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sha2::Sha256;
use sqlx::Row;
use std::collections::{BTreeSet, HashMap};
use uuid::Uuid;

#[derive(Clone)]
struct EdgeConfig {
    origin: String,
    secret: String,
}

#[derive(Default, Deserialize)]
pub(crate) struct Subscriptions {
    pub primaries: Vec<String>,
    pub targets: Vec<String>,
}

fn config() -> Option<EdgeConfig> {
    let origin = std::env::var("EDGE_PUBLIC_ORIGIN").ok()?;
    let secret = std::env::var("EDGE_INGEST_HMAC_SECRET")
        .ok()
        .filter(|value| value.len() >= 32)?;
    let parsed = reqwest::Url::parse(&origin).ok()?;
    let local = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"));
    if parsed.origin().ascii_serialization() != origin
        || (parsed.scheme() != "https" && !(local && parsed.scheme() == "http"))
    {
        return None;
    }
    Some(EdgeConfig { origin, secret })
}

pub(crate) fn configured() -> bool {
    config().is_some()
}

fn signature(secret: &str, timestamp: &str, batch: &str, body: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key");
    mac.update(format!("{timestamp}.{batch}.{body}").as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) async fn subscriptions(app: &App) -> Option<Subscriptions> {
    let config = config()?;
    let timestamp = Utc::now().timestamp_millis().to_string();
    let batch = format!("request_{}", Uuid::new_v4());
    let response = app
        .http
        .get(format!("{}/internal/v1/subscriptions", config.origin))
        .header("x-maple-timestamp", &timestamp)
        .header("x-maple-batch-id", &batch)
        .header(
            "x-maple-signature",
            signature(&config.secret, &timestamp, &batch, ""),
        )
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let value = response.json::<Subscriptions>().await.ok()?;
    if value
        .primaries
        .iter()
        .chain(value.targets.iter())
        .any(|name| name.is_empty() || name.chars().count() > 20)
    {
        return None;
    }
    Some(value)
}

fn merge_array(
    target: &mut Map<String, Value>,
    incoming: &Map<String, Value>,
    field: &str,
    keys: &[&str],
) {
    let mut values = std::collections::BTreeMap::new();
    for item in target
        .get(field)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .chain(
            incoming
                .get(field)
                .and_then(Value::as_array)
                .into_iter()
                .flatten(),
        )
    {
        let key = keys
            .iter()
            .map(|name| item.get(name).and_then(Value::as_str).unwrap_or(""))
            .collect::<Vec<_>>()
            .join("\0");
        if !key.is_empty() {
            values.insert(key, item.clone());
        }
    }
    target.insert(
        field.to_owned(),
        Value::Array(values.into_values().collect()),
    );
}

pub(crate) fn merge_ingest(previous: Option<Value>, current: Value) -> Value {
    let Some(mut old) = previous.and_then(|value| value.as_object().cloned()) else {
        return current;
    };
    let Some(new) = current.as_object() else {
        return Value::Object(old);
    };
    for (field, keys) in [
        ("current", &["ocid"][..]),
        ("dailySnapshots", &["ocid", "date"][..]),
        ("todayBaselines", &["ocid", "date"][..]),
        ("guilds", &["guildKey"][..]),
    ] {
        merge_array(&mut old, new, field, keys);
    }
    for field in ["batchId", "sentAt", "sync"] {
        if let Some(value) = new.get(field) {
            old.insert(field.to_owned(), value.clone());
        }
    }
    Value::Object(old)
}

fn normalized(
    ocid: &str,
    guild_key: Option<&str>,
    basic: &Value,
    observed_at: &str,
) -> Option<Value> {
    let exp = basic.get("character_exp")?;
    let exp = exp
        .as_str()
        .map(str::to_owned)
        .or_else(|| exp.as_u64().map(|value| value.to_string()))?;
    let rate = basic
        .get("character_exp_rate")?
        .as_str()
        .and_then(|value| value.parse::<f64>().ok())
        .or_else(|| basic.get("character_exp_rate")?.as_f64())?;
    Some(json!({
        "ocid":ocid,
        "name":basic.get("character_name")?.as_str()?,
        "worldName":basic.get("world_name").and_then(Value::as_str),
        "characterClass":basic.get("character_class").and_then(Value::as_str),
        "level":basic.get("character_level")?.as_u64()?,
        "exp":exp,
        "expRate":rate,
        "guildName":basic.get("character_guild_name").and_then(Value::as_str),
        "guildKey":guild_key,
        "imageUrl":basic.get("character_image").and_then(Value::as_str),
        "observedAt":observed_at
    }))
}

fn state_checksum(value: &Value, volatile: &[&str]) -> String {
    let mut stable = value.clone();
    if let Some(object) = stable.as_object_mut() {
        for key in volatile {
            object.remove(*key);
        }
    }
    crate::hash(&serde_json::to_string(&stable).unwrap_or_default())
}

const HUNTING_GAIN_MIN_EXCLUSIVE: i64 = 1_000_000_000;
const HUNTING_GAIN_MAX_EXCLUSIVE: i64 = 1_000_000_000_000;

fn activity_decision(
    samples: &[(Value, chrono::DateTime<Utc>)],
) -> (Option<&'static str>, Option<String>) {
    let [(latest, latest_at), (previous, _)] = samples else {
        return (None, None);
    };
    let number = |value: &Value, key: &str| {
        value
            .get(key)?
            .as_i64()
            .or_else(|| value.get(key)?.as_str()?.parse().ok())
    };
    let Some(previous_level) = number(previous, "character_level") else {
        return (None, None);
    };
    let Some(previous_exp) = number(previous, "character_exp") else {
        return (None, None);
    };
    let Some(latest_level) = number(latest, "character_level") else {
        return (None, None);
    };
    let Some(latest_exp) = number(latest, "character_exp") else {
        return (None, None);
    };
    let gain = crate::exp::calculate_gain(previous_level, previous_exp, latest_level, latest_exp);
    match gain {
        crate::exp::ExpCalculation::Ok(0) => (Some("inactive"), Some(latest_at.to_rfc3339())),
        crate::exp::ExpCalculation::Ok(value)
            if value > HUNTING_GAIN_MIN_EXCLUSIVE && value < HUNTING_GAIN_MAX_EXCLUSIVE =>
        {
            (Some("active"), Some(latest_at.to_rfc3339()))
        }
        _ => (None, None),
    }
}

async fn build_changes(
    pool: &PgPool,
    names: &[String],
    run: i64,
) -> Result<(Value, Vec<(String, String, String)>), sqlx::Error> {
    let existing: HashMap<(String, String), String> =
        sqlx::query("SELECT kind,item_key,checksum FROM edge_export_state")
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|row| ((row.get("kind"), row.get("item_key")), row.get("checksum")))
            .collect();
    let mut states = Vec::new();
    let mut current = Vec::new();
    let rows =
        sqlx::query("SELECT ocid,guild_key,basic,observed_at FROM characters WHERE name=ANY($1)")
            .bind(names)
            .fetch_all(pool)
            .await?;
    let ocids: Vec<String> = rows.iter().map(|row| row.get("ocid")).collect();
    let mut activity_samples: HashMap<String, Vec<(Value, chrono::DateTime<Utc>)>> = HashMap::new();
    for row in sqlx::query("SELECT ocid,basic,observed_at FROM (SELECT ocid,basic,observed_at,row_number() OVER(PARTITION BY ocid ORDER BY observed_at DESC) AS sample_number FROM observations WHERE ocid=ANY($1)) samples WHERE sample_number<=2 ORDER BY ocid,sample_number")
        .bind(&ocids).fetch_all(pool).await?
    {
        activity_samples.entry(row.get("ocid")).or_default().push((row.get("basic"),row.get("observed_at")));
    }
    let mut guild_keys = BTreeSet::new();
    for row in rows {
        let ocid: String = row.get("ocid");
        let guild_key: Option<String> = row.get("guild_key");
        let basic: Value = row.get("basic");
        let observed: chrono::DateTime<Utc> = row.get("observed_at");
        if let Some(key) = &guild_key {
            guild_keys.insert(key.clone());
        }
        if let Some(mut value) =
            normalized(&ocid, guild_key.as_deref(), &basic, &observed.to_rfc3339())
        {
            let (decision, decided_at) = activity_samples
                .get(&ocid)
                .map(|samples| activity_decision(samples))
                .unwrap_or((None, None));
            value["activityDecision"] = decision.into();
            value["activityDecisionAt"] = decided_at.into();
            let checksum = state_checksum(&value, &["observedAt"]);
            let key = ("current".to_owned(), ocid.clone());
            if existing.get(&key) != Some(&checksum) {
                current.push(value);
                states.push((key.0, key.1, checksum));
            }
        }
    }
    let today = Utc::now()
        .with_timezone(&chrono_tz::Asia::Seoul)
        .date_naive();
    let mut daily = Vec::new();
    for row in sqlx::query("SELECT ocid,date,basic FROM daily_snapshots WHERE ocid=ANY($1) AND date>=$2 ORDER BY ocid,date")
        .bind(&ocids)
        .bind(today - chrono::Duration::days(30))
        .fetch_all(pool)
        .await?
    {
        let ocid: String = row.get("ocid");
        let date: chrono::NaiveDate = row.get("date");
        let basic: Value = row.get("basic");
        if let Some(mut value) = normalized(&ocid, None, &basic, "2000-01-01T00:00:00Z") {
            let object = value.as_object_mut().expect("normalized object");
            object.remove("guildKey");
            object.remove("observedAt");
            object.insert("date".into(), json!(date));
            let checksum = state_checksum(&value, &[]);
            let item_key = format!("{ocid}:{date}");
            let key = ("daily".to_owned(), item_key);
            if existing.get(&key) != Some(&checksum) {
                daily.push(value);
                states.push((key.0, key.1, checksum));
            }
        }
    }
    let midnight = chrono_tz::Asia::Seoul
        .from_local_datetime(&today.and_hms_opt(0, 0, 0).expect("midnight"))
        .single()
        .expect("KST midnight")
        .with_timezone(&Utc);
    let mut baselines = Vec::new();
    for row in sqlx::query("SELECT DISTINCT ON (ocid) ocid,basic FROM observations WHERE ocid=ANY($1) AND observed_at >=$2 AND observed_at<$3 ORDER BY ocid,abs(extract(epoch FROM observed_at-$4)),observed_at")
        .bind(&ocids)
        .bind(midnight - chrono::Duration::days(1))
        .bind(midnight + chrono::Duration::days(1))
        .bind(midnight)
        .fetch_all(pool)
        .await?
    {
        let ocid: String = row.get("ocid");
        let basic: Value = row.get("basic");
        if let Some(value) = normalized(&ocid, None, &basic, "2000-01-01T00:00:00Z") {
            let baseline = json!({"ocid":ocid,"name":value["name"],"level":value["level"],"exp":value["exp"],"expRate":value["expRate"],"date":today});
            let checksum = state_checksum(&baseline, &[]);
            let item_key = format!(
                "{}:{today}",
                baseline["ocid"].as_str().unwrap_or("")
            );
            let key = ("baseline".to_owned(), item_key);
            if existing.get(&key) != Some(&checksum) {
                baselines.push(baseline);
                states.push((key.0, key.1, checksum));
            }
        }
    }
    let mut guilds = Vec::new();
    for key in guild_keys {
        let Some(guild) =
            sqlx::query("SELECT world,name,observed_at FROM guilds WHERE guild_key=$1")
                .bind(&key)
                .fetch_optional(pool)
                .await?
        else {
            continue;
        };
        let members: Vec<String> =
            sqlx::query_scalar("SELECT name FROM guild_members WHERE guild_key=$1 ORDER BY name")
                .bind(&key)
                .fetch_all(pool)
                .await?;
        let mut history = Vec::new();
        for row in sqlx::query("SELECT date,basic FROM guild_daily_snapshots WHERE guild_key=$1 AND date>=$2 ORDER BY date")
            .bind(&key)
            .bind(today - chrono::Duration::days(30))
            .fetch_all(pool)
            .await?
        {
            let date: chrono::NaiveDate = row.get("date");
            let basic: Value = row.get("basic");
            let names = basic["guild_member"]
                .as_array()
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>())
                .unwrap_or_default();
            history.push(json!({"date":date,"members":names}));
        }
        let value = json!({"guildKey":key,"worldName":guild.get::<String,_>("world"),"name":guild.get::<String,_>("name"),"observedAt":guild.get::<chrono::DateTime<Utc>,_>("observed_at").to_rfc3339(),"members":members,"daily":history});
        let checksum = state_checksum(&value, &["observedAt"]);
        let item_key = value["guildKey"].as_str().unwrap_or("").to_owned();
        let state_key = ("guild".to_owned(), item_key);
        if existing.get(&state_key) != Some(&checksum) {
            guilds.push(value);
            states.push((state_key.0, state_key.1, checksum));
        }
    }
    let sync = sqlx::query(
        "SELECT started_at,finished_at,succeeded,failed,status FROM sync_runs WHERE id=$1",
    )
    .bind(run)
    .fetch_one(pool)
    .await?;
    let batch = format!("batch_{}", Uuid::new_v4());
    let sent = Utc::now().to_rfc3339();
    Ok((
        json!({"batchId":batch,"sentAt":sent,"current":current,"dailySnapshots":daily,"todayBaselines":baselines,"guilds":guilds,"sync":{"status":sync.get::<String,_>("status"),"startedAt":sync.get::<chrono::DateTime<Utc>,_>("started_at"),"finishedAt":sync.get::<Option<chrono::DateTime<Utc>>,_>("finished_at"),"succeeded":sync.get::<i32,_>("succeeded"),"failed":sync.get::<i32,_>("failed")}}),
        states,
    ))
}

async fn flush(app: &App, config: &EdgeConfig) -> Result<(), sqlx::Error> {
    let pool = app.db.as_ref().expect("collector requires database");
    let Some(row) = sqlx::query("SELECT batch_id,body FROM edge_outbox WHERE slot=1")
        .fetch_optional(pool)
        .await?
    else {
        return Ok(());
    };
    let batch: String = row.get("batch_id");
    let mut body: Value = row.get("body");
    for _ in 0..64 {
        let now = Utc::now();
        let mut chunk = ingest_chunk(&body);
        let fingerprint = crate::hash(&serde_json::to_string(&chunk).unwrap_or_default());
        let chunk_batch = format!("{batch}-{}", &fingerprint[..12]);
        chunk["sentAt"] = json!(now.to_rfc3339());
        chunk["batchId"] = json!(chunk_batch);
        let raw = serde_json::to_string(&chunk).unwrap_or_default();
        let timestamp = now.timestamp_millis().to_string();
        sqlx::query("UPDATE edge_outbox SET last_attempt_at=$1,attempts=attempts+1,last_error=NULL WHERE slot=1")
            .bind(now)
            .execute(pool)
            .await?;
        let response = app
            .http
            .post(format!("{}/internal/v1/ingest", config.origin))
            .header("content-type", "application/json")
            .header("x-maple-timestamp", &timestamp)
            .header("x-maple-batch-id", &chunk_batch)
            .header(
                "x-maple-signature",
                signature(&config.secret, &timestamp, &chunk_batch, &raw),
            )
            .body(raw)
            .send()
            .await;
        let delivered = response.as_ref().is_ok_and(|value| {
            value.status().is_success() || value.status() == StatusCode::CONFLICT
        });
        if !delivered {
            let reason = match response {
                Ok(value) => format!("HTTP {}", value.status().as_u16()),
                Err(value) if value.is_timeout() => "timeout".into(),
                Err(value) if value.is_connect() => "connect".into(),
                Err(_) => "request".into(),
            };
            sqlx::query("UPDATE edge_outbox SET last_error=$1 WHERE slot=1")
                .bind(reason)
                .execute(pool)
                .await?;
            break;
        }
        remove_chunk(&mut body, &chunk);
        if ingest_empty(&body) {
            sqlx::query("DELETE FROM edge_outbox WHERE slot=1 AND batch_id=$1")
                .bind(&batch)
                .execute(pool)
                .await?;
            break;
        }
        body["sentAt"] = json!(now.to_rfc3339());
        sqlx::query("UPDATE edge_outbox SET body=$1,updated_at=now() WHERE slot=1 AND batch_id=$2")
            .bind(&body)
            .bind(&batch)
            .execute(pool)
            .await?;
    }
    Ok(())
}

fn ingest_chunk(body: &Value) -> Value {
    let take = |key: &str, limit: usize| {
        body[key]
            .as_array()
            .map(|values| values.iter().take(limit).cloned().collect::<Vec<_>>())
            .unwrap_or_default()
    };
    json!({"batchId":body["batchId"],"sentAt":body["sentAt"],"current":take("current",400),"dailySnapshots":take("dailySnapshots",500),"todayBaselines":take("todayBaselines",400),"guilds":take("guilds",2),"sync":body["sync"]})
}

fn remove_chunk(body: &mut Value, chunk: &Value) {
    for key in ["current", "dailySnapshots", "todayBaselines", "guilds"] {
        let count = chunk[key].as_array().map(Vec::len).unwrap_or(0);
        if let Some(values) = body[key].as_array_mut() {
            values.drain(..count.min(values.len()));
        }
    }
}

fn ingest_empty(body: &Value) -> bool {
    ["current", "dailySnapshots", "todayBaselines", "guilds"]
        .iter()
        .all(|key| body[*key].as_array().is_none_or(Vec::is_empty))
}

pub(crate) async fn flush_pending(app: &App) -> Result<(), sqlx::Error> {
    let Some(config) = config() else {
        return Ok(());
    };
    flush(app, &config).await
}

pub(crate) async fn enqueue_and_flush(
    app: &App,
    names: &[String],
    run: i64,
) -> Result<(), sqlx::Error> {
    let Some(config) = config() else {
        return Ok(());
    };
    let pool = app.db.as_ref().expect("collector requires database");
    let (current, states) = build_changes(pool, names, run).await?;
    let previous: Option<Value> = sqlx::query_scalar("SELECT body FROM edge_outbox WHERE slot=1")
        .fetch_optional(pool)
        .await?;
    let merged = merge_ingest(previous, current);
    let batch = merged["batchId"].as_str().unwrap_or("");
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO edge_outbox(slot,batch_id,body) VALUES(1,$1,$2) ON CONFLICT(slot) DO UPDATE SET batch_id=excluded.batch_id,body=excluded.body,attempts=0,updated_at=now(),last_attempt_at=NULL,last_error=NULL").bind(batch).bind(&merged).execute(&mut *tx).await?;
    for (kind, key, checksum) in states {
        sqlx::query("INSERT INTO edge_export_state(kind,item_key,checksum) VALUES($1,$2,$3) ON CONFLICT(kind,item_key) DO UPDATE SET checksum=excluded.checksum,queued_at=now()").bind(kind).bind(key).bind(checksum).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    flush(app, &config).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outbox_merge_keeps_unsent_daily_changes_and_replaces_current() {
        let old = json!({"batchId":"old","sentAt":"old","current":[{"ocid":"a","exp":"1"}],"dailySnapshots":[{"ocid":"a","date":"2026-09-01"}],"todayBaselines":[],"guilds":[],"sync":{"status":"old"}});
        let new = json!({"batchId":"new","sentAt":"new","current":[{"ocid":"a","exp":"2"}],"dailySnapshots":[{"ocid":"a","date":"2026-09-02"}],"todayBaselines":[],"guilds":[],"sync":{"status":"new"}});
        let merged = merge_ingest(Some(old), new);
        assert_eq!(merged["batchId"], "new");
        assert_eq!(merged["current"][0]["exp"], "2");
        assert_eq!(merged["dailySnapshots"].as_array().unwrap().len(), 2);
    }
    #[test]
    fn hmac_matches_edge_contract() {
        assert_eq!(
            signature("secret", "123", "batch", "{}"),
            "400aec3b7383b34d5809d4639c23818fe5e6b081a83e18e2c36c00d226dd8e44"
        );
    }
    #[test]
    fn large_ingest_is_split_without_losing_remainder() {
        let mut body = json!({"batchId":"batch","sentAt":"now","current":[1,2,3],"dailySnapshots":(0..1200).collect::<Vec<_>>(),"todayBaselines":[],"guilds":[],"sync":{}});
        let first = ingest_chunk(&body);
        assert_eq!(first["dailySnapshots"].as_array().unwrap().len(), 500);
        remove_chunk(&mut body, &first);
        assert_eq!(body["dailySnapshots"].as_array().unwrap().len(), 700);
        assert!(!ingest_empty(&body));
        let second = ingest_chunk(&body);
        remove_chunk(&mut body, &second);
        let third = ingest_chunk(&body);
        remove_chunk(&mut body, &third);
        assert!(ingest_empty(&body));
    }

    #[test]
    fn hunting_state_changes_only_for_zero_and_middle_gain_band() {
        let at = Utc::now();
        let samples = |gain: i64| {
            vec![
                (json!({"character_level":281,"character_exp":gain}), at),
                (
                    json!({"character_level":281,"character_exp":0}),
                    at - chrono::Duration::minutes(15),
                ),
            ]
        };
        assert_eq!(activity_decision(&samples(0)).0, Some("inactive"));
        assert_eq!(activity_decision(&samples(1_000_000_001)).0, Some("active"));
        assert_eq!(
            activity_decision(&samples(999_999_999_999)).0,
            Some("active")
        );
        assert_eq!(activity_decision(&samples(1)).0, None);
        assert_eq!(activity_decision(&samples(1_000_000_000)).0, None);
        assert_eq!(activity_decision(&samples(1_000_000_000_000)).0, None);
        assert_eq!(activity_decision(&samples(1_000_000_000_001)).0, None);
    }
}
