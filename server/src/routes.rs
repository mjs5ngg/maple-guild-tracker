// 사용자 설정과 공용 스냅샷을 인증된 사용자에게만 제공합니다.
use crate::*;
use serde::Deserialize;
use sqlx::Row;

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
    Ok(Json(json!({"primary":primary,"favorites":favorites})))
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
    let mut characters = Vec::new();
    for row in rows {
        let ocid: String = row.get("ocid");
        let basic: serde_json::Value = row.get("basic");
        let observed: chrono::DateTime<chrono::Utc> = row.get("observed_at");
        let history=sqlx::query("SELECT date,basic FROM daily_snapshots WHERE ocid=$1 AND date >=$2 AND date<$3 ORDER BY date")
            .bind(&ocid).bind(today-chrono::Duration::days(30)).bind(today).fetch_all(app.pool()?).await?;
        let history:Vec<_>=history.into_iter().map(|r|json!({"date":r.get::<chrono::NaiveDate,_>("date"),"basic":r.get::<serde_json::Value,_>("basic")})).collect();
        use chrono::TimeZone;
        let midnight = chrono_tz::Asia::Seoul
            .from_local_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&chrono::Utc);
        let baseline:Option<serde_json::Value> = sqlx::query_scalar("SELECT basic FROM observations WHERE ocid=$1 AND observed_at >=$2 AND observed_at<$3 ORDER BY abs(extract(epoch FROM observed_at-$4)),observed_at LIMIT 1")
            .bind(&ocid).bind(midnight-chrono::Duration::days(1)).bind(midnight+chrono::Duration::days(1)).bind(midnight).fetch_optional(app.pool()?).await?;
        let yesterday = (today - chrono::Duration::days(1)).to_string();
        let estimated = !history
            .iter()
            .any(|h| h["date"].as_str() == Some(yesterday.as_str()));
        characters.push(json!({"ocid":ocid,"basic":basic,"observedAt":observed,"history":history,"todayBaseline":baseline,"estimated":estimated}));
    }
    let last = sqlx::query(
        "SELECT started_at,finished_at,succeeded,failed FROM sync_runs ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(app.pool()?)
    .await?;
    let sync=last.map(|r|json!({"startedAt":r.get::<chrono::DateTime<chrono::Utc>,_>("started_at"),"finishedAt":r.get::<Option<chrono::DateTime<chrono::Utc>>,_>("finished_at"),"succeeded":r.get::<i32,_>("succeeded"),"failed":r.get::<i32,_>("failed")}));
    Ok(Json(
        json!({"characters":characters,"sync":sync,"today":today}),
    ))
}
