// 사용자 설정과 공용 스냅샷을 인증된 사용자에게만 제공합니다.
use crate::*;
use serde::Deserialize;
use sqlx::Row;

// 저장 원본은 유지하고 웹에서 사용하는 필드만 응답에 포함합니다.
fn web_basic(source: &serde_json::Value) -> serde_json::Value {
    let fields = ["character_name", "world_name", "character_class", "character_level",
        "character_exp", "character_exp_rate", "character_guild_name", "character_image"];
    let mut result = serde_json::Map::new();
    for field in fields {
        if let Some(value) = source.get(field) {
            result.insert(field.to_owned(), value.clone());
        }
    }
    serde_json::Value::Object(result)
}

#[test]
fn web_projection_preserves_exact_experience_and_source() {
    let source = json!({"character_name":"대표", "character_level":282,
        "character_exp":99999999999999999u64, "character_exp_rate":"21.482",
        "character_guild_name":null, "character_image":"image", "unused":"large raw field"});
    let projected = web_basic(&source);
    assert_eq!(projected["character_exp"], source["character_exp"]);
    assert_eq!(projected["character_exp_rate"], "21.482");
    assert_eq!(projected["character_image"], "image");
    assert!(projected.get("character_guild_name").unwrap().is_null());
    assert!(projected.get("unused").is_none());
    assert_eq!(source["unused"], "large raw field");
    assert!(projected.get("world_name").is_none());
}

pub async fn status(State(app): State<Arc<App>>) -> Json<serde_json::Value> {
    Json(
        json!({"database":app.db.is_some(),"collector":app.db.is_some()&&app.operator_key.is_some(),"providers":auth::available(),"intervalMinutes":15,"favoriteLimit":policy::FAVORITE_LIMIT}),
    )
}
pub async fn me(State(app): State<Arc<App>>, headers: HeaderMap) -> ApiResult<serde_json::Value> {
    let id = user(&app, &headers).await?;
    let primary: String = sqlx::query_scalar("SELECT primary_name FROM users WHERE id=$1")
        .bind(&id)
        .fetch_one(app.pool()?)
        .await?;
    let favorites: Vec<String> =
        sqlx::query_scalar("SELECT name FROM favorites WHERE user_id=$1 ORDER BY name")
            .bind(&id)
            .fetch_all(app.pool()?)
            .await?;
    let signed_in = cookie(&headers, "maple_session").is_some();
    Ok(Json(json!({"primary":primary,"favorites":favorites,"signedIn":signed_in})))
}
pub async fn activity(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> ApiResult<serde_json::Value> {
    let id = user(&app, &headers).await?;
    sqlx::query("UPDATE users SET last_active=now() WHERE id=$1")
        .bind(id)
        .execute(app.pool()?)
        .await?;
    Ok(Json(json!({"ok":true})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    primary: String,
    favorites: Vec<String>,
}
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= 20
        && !name.chars().any(|c| c.is_control() || c.is_whitespace())
}
pub async fn profile(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<Profile>,
) -> ApiResult<serde_json::Value> {
    let id = user(&app, &headers).await?;
    let favorites: std::collections::BTreeSet<_> = input.favorites.iter().collect();
    if !valid_name(&input.primary)
        || favorites.len() > policy::FAVORITE_LIMIT
        || favorites.iter().any(|n| !valid_name(n))
    {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "대표캐릭터와 즐겨찾기 30명 이내의 닉네임을 확인하세요.",
        ));
    }
    let mut tx = app.pool()?.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE users SET primary_name=$1,last_active=now() WHERE id=$2")
        .bind(input.primary)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM favorites WHERE user_id=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    for name in favorites {
        sqlx::query("INSERT INTO favorites VALUES($1,$2)")
            .bind(&id)
            .bind(name)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
pub async fn dashboard(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> ApiResult<serde_json::Value> {
    let id = user(&app, &headers).await?;
    let rows=sqlx::query("SELECT c.ocid,c.basic,c.observed_at FROM characters c WHERE c.name=(SELECT primary_name FROM users WHERE id=$1) OR c.name IN (SELECT name FROM favorites WHERE user_id=$1) OR c.name IN (SELECT m.name FROM guild_members m JOIN characters p ON p.guild_key=m.guild_key JOIN users u ON u.primary_name=p.name WHERE u.id=$1) ORDER BY (c.basic->>'character_level')::int DESC,(c.basic->>'character_exp')::bigint DESC,c.name")
        .bind(&id).fetch_all(app.pool()?).await?;
    let today = chrono::Utc::now()
        .with_timezone(&chrono_tz::Asia::Seoul)
        .date_naive();
    use chrono::TimeZone;
    use std::collections::HashMap;
    let midnight = chrono_tz::Asia::Seoul
        .from_local_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .unwrap()
        .with_timezone(&chrono::Utc);
    let ocids: Vec<String> = rows.iter().map(|row| row.get("ocid")).collect();
    let history_rows=sqlx::query("SELECT ocid,date,basic FROM daily_snapshots WHERE ocid=ANY($1) AND date >=$2 AND date<$3 ORDER BY ocid,date")
        .bind(&ocids).bind(today-chrono::Duration::days(30)).bind(today).fetch_all(app.pool()?).await?;
    let mut histories: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    for row in history_rows {
        histories.entry(row.get("ocid")).or_default().push(json!({"date":row.get::<chrono::NaiveDate,_>("date"),"basic":row.get::<serde_json::Value,_>("basic")}));
    }
    let baseline_rows=sqlx::query("SELECT DISTINCT ON (ocid) ocid,basic FROM observations WHERE ocid=ANY($1) AND observed_at >=$2 AND observed_at<$3 ORDER BY ocid,abs(extract(epoch FROM observed_at-$4)),observed_at")
        .bind(&ocids).bind(midnight-chrono::Duration::days(1)).bind(midnight+chrono::Duration::days(1)).bind(midnight).fetch_all(app.pool()?).await?;
    let mut baselines: HashMap<String, serde_json::Value> = baseline_rows
        .into_iter()
        .map(|row| (row.get("ocid"), row.get("basic")))
        .collect();
    let mut characters = Vec::new();
    let guild_key: Option<String> = sqlx::query_scalar(
        "SELECT c.guild_key FROM characters c JOIN users u ON u.primary_name=c.name WHERE u.id=$1",
    )
    .bind(&id)
    .fetch_optional(app.pool()?)
    .await?
    .flatten();
    let current_members: Vec<String> =
        sqlx::query_scalar("SELECT name FROM guild_members WHERE guild_key=$1")
            .bind(&guild_key)
            .fetch_all(app.pool()?)
            .await?;
    let guild_dates: Vec<(chrono::NaiveDate, serde_json::Value)> = sqlx::query_as(
        "SELECT date,basic FROM guild_daily_snapshots WHERE guild_key=$1 AND date >=$2 AND date<$3",
    )
    .bind(&guild_key)
    .bind(today - chrono::Duration::days(30))
    .bind(today)
    .fetch_all(app.pool()?)
    .await?;
    for row in rows {
        let ocid: String = row.get("ocid");
        let basic: serde_json::Value = row.get("basic");
        let observed: chrono::DateTime<chrono::Utc> = row.get("observed_at");
        let history = histories.remove(&ocid).unwrap_or_default();
        let baseline = baselines.remove(&ocid);
        let yesterday = (today - chrono::Duration::days(1)).to_string();
        let estimated = !history
            .iter()
            .any(|h| h["date"].as_str() == Some(yesterday.as_str()));
        let current_member = current_members
            .iter()
            .any(|name| Some(name.as_str()) == basic["character_name"].as_str());
        let membership = guild_key.as_ref().map(|_| {
            let mut dates = serde_json::Map::new();
            dates.insert(today.to_string(), json!(current_member));
            for (date, roster) in &guild_dates {
                let date = date.to_string();
                let name = history
                    .iter()
                    .find(|h| h["date"].as_str() == Some(date.as_str()))
                    .and_then(|h| h["basic"]["character_name"].as_str());
                if let (Some(name), Some(members)) = (name, roster["guild_member"].as_array()) {
                    dates.insert(
                        date,
                        json!(members.iter().any(|m| m.as_str() == Some(name))),
                    );
                }
            }
            dates
        });
        let history: Vec<_> = history.into_iter().map(|entry| json!({"date":entry["date"],"basic":web_basic(&entry["basic"])})).collect();
        let baseline = baseline.as_ref().map(web_basic);
        characters.push(json!({"ocid":ocid,"basic":web_basic(&basic),"observedAt":observed,"history":history,"todayBaseline":baseline,"estimated":estimated,"isGuildMember":current_member,"guildMembership":membership}));
    }
    let last = sqlx::query(
        "SELECT started_at,finished_at,succeeded,failed,status FROM sync_runs ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(app.pool()?)
    .await?;
    let sync=last.map(|r|json!({"status":r.get::<String,_>("status"),"startedAt":r.get::<chrono::DateTime<chrono::Utc>,_>("started_at"),"finishedAt":r.get::<Option<chrono::DateTime<chrono::Utc>>,_>("finished_at"),"succeeded":r.get::<i32,_>("succeeded"),"failed":r.get::<i32,_>("failed")}));
    Ok(Json(
        json!({"characters":characters,"sync":sync,"today":today}),
    ))
}
