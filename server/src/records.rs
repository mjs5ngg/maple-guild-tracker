// 동일 OCID의 이름 변경과 최신 관측값을 하나의 트랜잭션으로 저장합니다.
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;

pub async fn save_current(
    pool: &PgPool,
    ocid: &str,
    basic: &Value,
    observed: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let name = basic["character_name"]
        .as_str()
        .ok_or(sqlx::Error::Protocol("missing character_name".into()))?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))")
        .bind(ocid)
        .execute(&mut *tx)
        .await?;
    let previous: Option<(String, DateTime<Utc>)> =
        sqlx::query_as("SELECT name,observed_at FROM characters WHERE ocid=$1")
            .bind(ocid)
            .fetch_optional(&mut *tx)
            .await?;
    if previous.as_ref().is_some_and(|(_, time)| *time > observed) {
        return Ok(());
    }
    // 이름 충돌은 다른 캐릭터일 수 있으므로 UNIQUE 제약으로 중단하고 원본을 유지합니다.
    sqlx::query("INSERT INTO characters(ocid,name,basic,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT(ocid) DO UPDATE SET name=excluded.name,basic=excluded.basic,observed_at=excluded.observed_at")
    .bind(ocid).bind(name).bind(basic).bind(observed).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO observations VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(ocid)
        .bind(observed)
        .bind(basic)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO character_names VALUES($1,$2,$3,$3) ON CONFLICT(ocid,name) DO UPDATE SET last_seen=excluded.last_seen")
    .bind(ocid).bind(name).bind(observed).execute(&mut *tx).await?;
    if let Some((old, _)) = previous {
        if old != name {
            sqlx::query("UPDATE users SET primary_name=$1 WHERE primary_name=$2")
                .bind(name)
                .bind(&old)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO favorites SELECT user_id,$1 FROM favorites WHERE name=$2 ON CONFLICT DO NOTHING").bind(name).bind(&old).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM favorites WHERE name=$1")
                .bind(&old)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO guild_members SELECT guild_key,$1 FROM guild_members WHERE name=$2 ON CONFLICT DO NOTHING").bind(name).bind(&old).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM guild_members WHERE name=$1")
                .bind(&old)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await
}
