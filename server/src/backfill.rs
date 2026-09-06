// 과거 보충 작업을 재시작 가능한 공정한 큐로 관리합니다.
use chrono::{DateTime, Duration, NaiveDate, Utc};
use sqlx::PgPool;

pub async fn enqueue(
    pool: &PgPool,
    targets: &[String],
    start: NaiveDate,
    end: NaiveDate,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO backfill_jobs(ocid,date) SELECT target,d::date FROM unnest($1::text[]) target CROSS JOIN generate_series($2::date,$3::date,interval '1 day') d WHERE NOT EXISTS(SELECT 1 FROM daily_snapshots s WHERE s.ocid=target AND s.date=d::date) ON CONFLICT DO NOTHING")
        .bind(targets).bind(start).bind(end).execute(pool).await?;
    Ok(())
}

pub async fn due(
    pool: &PgPool,
    targets: &[String],
    start: NaiveDate,
    now: DateTime<Utc>,
    limit: i64,
) -> Result<Vec<(String, NaiveDate, i32)>, sqlx::Error> {
    // 첫날 한 캐릭터의 30일을 독점 처리하지 않고 대상별 최신 날짜를 번갈아 처리합니다.
    sqlx::query_as("SELECT ocid,date,attempts FROM (SELECT j.*,c.last_served,row_number() OVER(PARTITION BY j.ocid ORDER BY date DESC) AS turn FROM backfill_jobs j LEFT JOIN backfill_cursors c USING(ocid) WHERE j.ocid=ANY($1) AND date >=$2 AND next_attempt_at<=$3 AND NOT EXISTS(SELECT 1 FROM daily_snapshots s WHERE s.ocid=j.ocid AND s.date=j.date)) candidates ORDER BY turn,last_served NULLS FIRST,last_attempt_at NULLS FIRST,date DESC,ocid LIMIT $4")
        .bind(targets).bind(start).bind(now).bind(limit).fetch_all(pool).await
}

pub fn retry_at(now: DateTime<Utc>, attempts: i32) -> DateTime<Utc> {
    now + Duration::minutes((30_i64 * 2_i64.pow(attempts.clamp(0, 4) as u32)).min(360))
}

pub async fn failed(
    pool: &PgPool,
    ocid: &str,
    date: NaiveDate,
    attempts: i32,
    now: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE backfill_jobs SET attempts=attempts+1,last_attempt_at=$1,next_attempt_at=$2 WHERE ocid=$3 AND date=$4")
        .bind(now).bind(retry_at(now,attempts)).bind(ocid).bind(date).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO backfill_cursors VALUES($1,$2) ON CONFLICT(ocid) DO UPDATE SET last_served=excluded.last_served").bind(ocid).bind(now).execute(&mut *tx).await?;
    tx.commit().await
}

pub async fn complete(
    pool: &PgPool,
    ocid: &str,
    date: NaiveDate,
    basic: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO daily_snapshots VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(ocid)
        .bind(date)
        .bind(basic)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM backfill_jobs WHERE ocid=$1 AND date=$2")
        .bind(ocid)
        .bind(date)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO backfill_cursors VALUES($1,now()) ON CONFLICT(ocid) DO UPDATE SET last_served=excluded.last_served").bind(ocid).execute(&mut *tx).await?;
    tx.commit().await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backoff_is_bounded() {
        let now = Utc::now();
        assert_eq!(retry_at(now, 0) - now, Duration::minutes(30));
        assert_eq!(retry_at(now, 20) - now, Duration::hours(6));
    }
}
