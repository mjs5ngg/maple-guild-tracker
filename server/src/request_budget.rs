// 서버 재시작과 동시 요청에도 유지되는 시간당 변경 요청 예산을 적용합니다.
use crate::*;

pub async fn take(pool: &PgPool, bucket: &str, limit: i32) -> Result<(), Failure> {
    let accepted: Option<i32> = sqlx::query_scalar(
        "INSERT INTO request_budgets(bucket,used) VALUES($1,1)
         ON CONFLICT(bucket) DO UPDATE SET
         used=CASE WHEN request_budgets.started_at<=now()-interval '1 hour' THEN 1 ELSE request_budgets.used+1 END,
         started_at=CASE WHEN request_budgets.started_at<=now()-interval '1 hour' THEN now() ELSE request_budgets.started_at END
         WHERE request_budgets.started_at<=now()-interval '1 hour' OR request_budgets.used<$2
         RETURNING used"
    ).bind(bucket).bind(limit).fetch_optional(pool).await?;
    accepted.map(|_| ()).ok_or(Failure(StatusCode::TOO_MANY_REQUESTS,
        "요청이 많습니다. 최대 1시간 뒤 다시 시도해 주세요. 기존 기록 조회는 계속 사용할 수 있습니다."))
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn concurrent_budget_and_expiry(pool: PgPool) {
    let mut jobs = tokio::task::JoinSet::new();
    for _ in 0..20 {
        let pool = pool.clone();
        jobs.spawn(async move { take(&pool,"test",10).await.is_ok() });
    }
    let mut successes = 0;
    while let Some(result) = jobs.join_next().await { successes += usize::from(result.unwrap()); }
    assert_eq!(successes,10);
    assert!(take(&pool,"other",10).await.is_ok());
    assert!(take(&pool,"test",10).await.is_err());
    sqlx::query("UPDATE request_budgets SET started_at=now()-interval '61 minutes' WHERE bucket='test'").execute(&pool).await.unwrap();
    assert!(take(&pool,"test",10).await.is_ok());
    let used: i32 = sqlx::query_scalar("SELECT used FROM request_budgets WHERE bucket='test'").fetch_one(&pool).await.unwrap();
    assert_eq!(used,1);
}
