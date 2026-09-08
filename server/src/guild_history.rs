// 날짜 지정 길드 명단을 현재 명단과 분리 수집하고 실패를 재시도합니다.
use crate::*;
use chrono::{NaiveDate, Utc};

pub(crate) async fn collect(
    app: &App,
    guilds: &[String],
    start: NaiveDate,
    end: NaiveDate,
) -> Result<i32, sqlx::Error> {
    let pool = app.db.as_ref().unwrap();
    sqlx::query("INSERT INTO guild_history_jobs(guild_key,date) SELECT g,d::date FROM unnest($1::text[]) g CROSS JOIN generate_series($2::date,$3::date,interval '1 day') d WHERE NOT EXISTS(SELECT 1 FROM guild_daily_snapshots s WHERE s.guild_key=g AND s.date=d::date) ON CONFLICT DO NOTHING")
        .bind(guilds).bind(start).bind(end).execute(pool).await?;
    let jobs: Vec<(String,NaiveDate,i32)>=sqlx::query_as("SELECT guild_key,date,attempts FROM (SELECT *,row_number() OVER(PARTITION BY guild_key ORDER BY date DESC) turn FROM guild_history_jobs WHERE guild_key=ANY($1) AND date BETWEEN $2 AND $3 AND next_attempt_at<=now()) j ORDER BY turn,next_attempt_at,guild_key LIMIT 30")
        .bind(guilds).bind(start).bind(end).fetch_all(pool).await?;
    let mut failed = 0;
    for (id, date, attempts) in jobs {
        let date_string = date.to_string();
        let response = crate::collector::api(
            app,
            "guild/basic",
            &[("oguild_id", &id), ("date", &date_string)],
        )
        .await;
        match response {
            Ok(basic)
                if basic["guild_member"]
                    .as_array()
                    .is_some_and(|members| members.iter().all(|name| name.as_str().is_some())) =>
            {
                let mut tx = pool.begin().await?;
                sqlx::query("INSERT INTO guild_daily_snapshots(guild_key,date,basic) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
                    .bind(&id).bind(date).bind(basic).execute(&mut *tx).await?;
                sqlx::query("DELETE FROM guild_history_jobs WHERE guild_key=$1 AND date=$2")
                    .bind(&id)
                    .bind(date)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await?;
            }
            _ => {
                failed += 1;
                sqlx::query("UPDATE guild_history_jobs SET attempts=attempts+1,next_attempt_at=$3 WHERE guild_key=$1 AND date=$2")
                    .bind(&id).bind(date).bind(crate::backfill::retry_at(Utc::now(),attempts)).execute(pool).await?;
            }
        }
    }
    Ok(failed)
}
