// 실제 PostgreSQL에서 계정 격리와 개인 키 업로드 차단을 검증합니다.
use crate::*;
use axum::body::{to_bytes, Body};
use tower::ServiceExt;

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn dated_guild_history_keeps_current_roster_and_retries(pool: PgPool) {
    use axum::extract::Query;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = Arc::new(AtomicUsize::new(0));
    async fn mock(
        State(calls): State<Arc<AtomicUsize>>,
        Query(q): Query<HashMap<String, String>>,
    ) -> Json<serde_json::Value> {
        calls.fetch_add(1, Ordering::SeqCst);
        assert_eq!(q["oguild_id"], "active");
        Json(match q["date"].as_str() {
            "2026-09-01" => json!({"guild_member":["탈퇴자"]}),
            "2026-09-02" => json!({"guild_member":[]}),
            _ => json!({"guild_member":[null]}),
        })
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let state = calls.clone();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/maplestory/v1/guild/basic", get(mock))
                .with_state(state),
        )
        .await
        .unwrap();
    });
    sqlx::query("INSERT INTO guilds VALUES('active','스카니아','길드',now()),('inactive','스카니아','미이용',now())").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO guild_members VALUES('active','현재길드원')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO guild_history_jobs(guild_key,date) VALUES('inactive','2026-09-01')")
        .execute(&pool)
        .await
        .unwrap();
    let app = App {
        db: Some(pool.clone()),
        http: reqwest::Client::new(),
        origin: "http://127.0.0.1:3100".into(),
        operator_key: Some("mock".into()),
        nexon_origin: origin,
    };
    let start = "2026-09-01".parse().unwrap();
    let end = "2026-09-03".parse().unwrap();
    assert_eq!(
        guild_history::collect(&app, &["active".into()], start, end)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        guild_history::collect(&app, &["active".into()], start, end)
            .await
            .unwrap(),
        0
    );
    assert_eq!(calls.load(Ordering::SeqCst), 3);
    let snapshots: Vec<serde_json::Value> =
        sqlx::query_scalar("SELECT basic FROM guild_daily_snapshots ORDER BY date")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        snapshots,
        vec![
            json!({"guild_member":["탈퇴자"]}),
            json!({"guild_member":[]})
        ]
    );
    let current: String =
        sqlx::query_scalar("SELECT name FROM guild_members WHERE guild_key='active'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(current, "현재길드원");
    let attempt: i32 =
        sqlx::query_scalar("SELECT attempts FROM guild_history_jobs WHERE guild_key='active'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(attempt, 1);
    server.abort();
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn dashboard_batch_preserves_scope_dates_and_baselines(pool: PgPool) {
    use chrono::{Duration, TimeZone, Utc};
    let today = Utc::now()
        .with_timezone(&chrono_tz::Asia::Seoul)
        .date_naive();
    let midnight = chrono_tz::Asia::Seoul
        .from_local_datetime(&today.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .unwrap()
        .with_timezone(&Utc);
    sqlx::query("INSERT INTO users(id,primary_name) VALUES('batch','대표')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO favorites VALUES('batch','즐겨찾기'),('batch','빈기록')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO sessions VALUES($1,'batch',now()+interval '1 hour')")
        .bind(hash("batch-session"))
        .execute(&pool)
        .await
        .unwrap();
    for name in ["대표", "즐겨찾기", "빈기록", "다른사용자"] {
        let basic = json!({"character_name":name,"character_level":281,"character_exp":100});
        sqlx::query("INSERT INTO characters(ocid,name,basic,observed_at) VALUES($1,$1,$2,now())")
            .bind(name)
            .bind(&basic)
            .execute(&pool)
            .await
            .unwrap();
        if name == "빈기록" {
            continue;
        }
        for offset in [31, 30, 2, 1, 0] {
            sqlx::query("INSERT INTO daily_snapshots VALUES($1,$2,$3)")
                .bind(name)
                .bind(today - Duration::days(offset))
                .bind(json!({"name":name,"offset":offset}))
                .execute(&pool)
                .await
                .unwrap();
        }
        // 같은 거리의 앞/뒤 표본은 앞 표본을 고르고 캐릭터별로 독립 선택해야 합니다.
        for offset in [-30, -5, 5, 30] {
            sqlx::query("INSERT INTO observations VALUES($1,$2,$3)")
                .bind(name)
                .bind(midnight + Duration::minutes(offset))
                .bind(json!({"name":name,"offset":offset}))
                .execute(&pool)
                .await
                .unwrap();
        }
    }
    sqlx::query("INSERT INTO sync_runs(status) VALUES('running')")
        .execute(&pool)
        .await
        .unwrap();
    let app = Arc::new(App {
        db: Some(pool),
        http: reqwest::Client::new(),
        origin: "http://127.0.0.1:3100".into(),
        operator_key: None,
        nexon_origin: String::new(),
    });
    let response = router(app)
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/dashboard")
                .header("cookie", "maple_session=batch-session")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 100000).await.unwrap()).unwrap();
    assert_eq!(body["sync"]["status"], "running");
    let rows = body["characters"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert!(!rows.iter().any(|r| r["ocid"] == "다른사용자"));
    for row in rows {
        let name = row["ocid"].as_str().unwrap();
        let history = row["history"].as_array().unwrap();
        if name == "빈기록" {
            assert!(history.is_empty());
            assert!(row["todayBaseline"].is_null());
            assert_eq!(row["estimated"], true);
        } else {
            assert_eq!(history.len(), 3);
            assert_eq!(
                history
                    .iter()
                    .map(|h| h["basic"]["offset"].as_i64().unwrap())
                    .collect::<Vec<_>>(),
                vec![30, 2, 1]
            );
            assert!(history.iter().all(|h| h["basic"]["name"] == name));
            assert_eq!(row["todayBaseline"], json!({"name":name,"offset":-5}));
            assert_eq!(row["estimated"], false);
        }
    }
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn collector_caches_failures_and_refreshes_renamed_subscriptions(pool: PgPool) {
    use axum::extract::{Path, Query};
    use std::{
        collections::HashMap,
        sync::atomic::{AtomicUsize, Ordering},
    };
    let failures = Arc::new(AtomicUsize::new(0));
    async fn mock(
        State(failures): State<Arc<AtomicUsize>>,
        Path(path): Path<String>,
        Query(q): Query<HashMap<String, String>>,
    ) -> Response {
        let value = match path.as_str() {
            "id" if q["character_name"] == "실패" => {
                failures.fetch_add(1, Ordering::SeqCst);
                return StatusCode::BAD_REQUEST.into_response();
            }
            "id" => json!({"ocid":q["character_name"]}),
            "character/basic" => {
                json!({"character_name":if q["ocid"]=="stable-id" {"새이름"} else {&q["ocid"]},"character_level":281,"character_exp":100,"character_exp_rate":"0.1","world_name":"스카니아","character_guild_name":"길드"})
            }
            "guild/id" => json!({"oguild_id":"guild-id"}),
            "guild/basic" => json!({"guild_member":["새이름","길드원"]}),
            _ => return StatusCode::NOT_FOUND.into_response(),
        };
        Json(value).into_response()
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let state = failures.clone();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/maplestory/v1/{*path}", get(mock))
                .with_state(state),
        )
        .await
        .unwrap();
    });
    records::save_current(
        &pool,
        "stable-id",
        &json!({"character_name":"이전"}),
        chrono::Utc::now(),
    )
    .await
    .unwrap();
    sqlx::query("INSERT INTO users(id,primary_name) VALUES('rename','이전'),('fail-a','실패'),('fail-b','실패')").execute(&pool).await.unwrap();
    let app = App {
        db: Some(pool.clone()),
        http: reqwest::Client::new(),
        origin: "http://127.0.0.1:3100".into(),
        operator_key: Some("mock-only".into()),
        nexon_origin: origin,
    };
    collector::cycle(&app).await.unwrap();
    server.abort();
    assert_eq!(
        failures.load(Ordering::SeqCst),
        1,
        "같은 실패 대상을 한 주기에서 반복 조회하면 안 됩니다"
    );
    let names: Vec<String> = sqlx::query_scalar("SELECT name FROM characters ORDER BY name")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(
        names.contains(&"길드원".to_owned()),
        "대표 닉네임이 바뀐 주기에도 길드원을 수집해야 합니다"
    );
    let (succeeded, failed): (i32, i32) =
        sqlx::query_as("SELECT succeeded,failed FROM sync_runs ORDER BY id DESC LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((succeeded, failed), (2, 1));
    let observations: i64 =
        sqlx::query_scalar("SELECT count(*) FROM observations WHERE ocid='stable-id'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        observations, 2,
        "대표 최신 조회는 한 번만 추가되어야 합니다"
    );
}

// 큐 상태는 재시작 후에도 남고 활성 대상에만 공정하게 배분됩니다.
#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn backfill_fairness_and_retry(pool: PgPool) {
    use chrono::{Duration, Utc};
    let now = Utc::now();
    let end = now.date_naive();
    let start = end - Duration::days(2);
    for id in ["a", "b"] {
        records::save_current(&pool, id, &json!({"character_name":id}), now)
            .await
            .unwrap();
    }
    let active = vec!["a".to_string(), "b".to_string()];
    backfill::enqueue(&pool, &active, start, end).await.unwrap();
    backfill::enqueue(&pool, &active, start, end).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM backfill_jobs")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 6);
    let jobs = backfill::due(&pool, &active, start, now + Duration::seconds(1), 2)
        .await
        .unwrap();
    assert_eq!(jobs.len(), 2);
    assert_ne!(jobs[0].0, jobs[1].0);
    backfill::complete(&pool, "a", end, &json!({"character_name":"a"}))
        .await
        .unwrap();
    let next = backfill::due(&pool, &active, start, now + Duration::seconds(1), 1)
        .await
        .unwrap();
    assert_eq!(next[0].0, "b");
    backfill::failed(&pool, "b", end, 0, now).await.unwrap();
    let next = backfill::due(&pool, &active, start, now + Duration::minutes(29), 10)
        .await
        .unwrap();
    assert!(!next.iter().any(|(id, date, _)| id == "b" && *date == end));
    let next = backfill::due(&pool, &active, start, now + Duration::minutes(31), 10)
        .await
        .unwrap();
    assert!(next
        .iter()
        .any(|(id, date, attempt)| id == "b" && *date == end && *attempt == 1));
    assert!(
        backfill::due(&pool, &[], start, now + Duration::hours(2), 10)
            .await
            .unwrap()
            .is_empty()
    );
    let saved: i64 = sqlx::query_scalar("SELECT count(*) FROM daily_snapshots")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(saved, 1);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn rename_preserves_records_and_rejects_identity_merge(pool: PgPool) {
    use chrono::{Duration, Utc};
    let now = Utc::now();
    records::save_current(&pool, "id1", &json!({"character_name":"이전"}), now)
        .await
        .unwrap();
    sqlx::query("INSERT INTO users(id,primary_name) VALUES('owner','이전')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO favorites VALUES('owner','이전')")
        .execute(&pool)
        .await
        .unwrap();
    records::save_current(
        &pool,
        "id1",
        &json!({"character_name":"새이름"}),
        now + Duration::seconds(1),
    )
    .await
    .unwrap();
    let primary: String = sqlx::query_scalar("SELECT primary_name FROM users WHERE id='owner'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(primary, "새이름");
    let names: i64 = sqlx::query_scalar("SELECT count(*) FROM character_names WHERE ocid='id1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(names, 2);
    let observations: i64 = sqlx::query_scalar("SELECT count(*) FROM observations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(observations, 2);
    assert!(records::save_current(
        &pool,
        "different-id",
        &json!({"character_name":"새이름"}),
        now
    )
    .await
    .is_err());
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM characters")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    records::save_current(
        &pool,
        "id1",
        &json!({"character_name":"지연된응답"}),
        now - Duration::seconds(1),
    )
    .await
    .unwrap();
    let name: String = sqlx::query_scalar("SELECT name FROM characters WHERE ocid='id1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "새이름");
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn collector_mock_api_retries_deduplicates_and_recovers(pool: PgPool) {
    use axum::extract::{Path, Query};
    use std::{
        collections::HashMap,
        sync::atomic::{AtomicUsize, Ordering},
    };
    let calls = Arc::new(AtomicUsize::new(0));
    async fn mock(
        State(calls): State<Arc<AtomicUsize>>,
        Path(path): Path<String>,
        Query(q): Query<HashMap<String, String>>,
    ) -> Response {
        if calls.fetch_add(1, Ordering::SeqCst) == 0 {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let value = match path.as_str() {
            "id" => json!({"ocid":q["character_name"]}),
            "character/basic" => {
                json!({"character_name":q["ocid"],"character_level":281,"character_exp":100,"character_exp_rate":"0.1","character_class":"은월","world_name":"스카니아","character_guild_name":"길드","date":q.get("date")})
            }
            "guild/id" => json!({"oguild_id":"guild-id"}),
            "guild/basic" => json!({"guild_member":["A","B"]}),
            _ => return StatusCode::NOT_FOUND.into_response(),
        };
        Json(value).into_response()
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/maplestory/v1/{*path}", get(mock))
                .with_state(calls),
        )
        .await
        .unwrap();
    });
    sqlx::query("INSERT INTO users(id,primary_name,last_active) VALUES('active','A',now()),('inactive','C',now()-interval '168 hours')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO favorites VALUES('active','B'),('inactive','D')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO sync_runs DEFAULT VALUES")
        .execute(&pool)
        .await
        .unwrap();
    let app = App {
        db: Some(pool.clone()),
        http: reqwest::Client::new(),
        origin: "http://127.0.0.1:3100".into(),
        operator_key: Some("mock-only".into()),
        nexon_origin: origin,
    };
    collector::cycle(&app).await.unwrap();
    let names: Vec<String> = sqlx::query_scalar("SELECT name FROM characters ORDER BY name")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(names, vec!["A", "B"]);
    let latest: i64 = sqlx::query_scalar("SELECT count(*) FROM observations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(latest, 2);
    let interrupted: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sync_runs WHERE status='interrupted'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(interrupted, 1);
    let completed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sync_runs WHERE status='completed'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(completed, 1);
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM daily_snapshots")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(before >= 58);
    collector::cycle(&app).await.unwrap();
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM daily_snapshots")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    server.abort();
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "로컬 PostgreSQL DATABASE_URL 설정 후 실행합니다."]
async fn database_account_isolation(pool: PgPool) {
    sqlx::query("INSERT INTO users(id,primary_name) VALUES('test-a','A'),('test-b','B')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO sessions VALUES($1,'test-a',now()+interval '1 hour')")
        .bind(hash("test-session"))
        .execute(&pool)
        .await
        .unwrap();
    let app = Arc::new(App {
        nexon_origin: "http://127.0.0.1:1".into(),
        db: Some(pool.clone()),
        http: reqwest::Client::new(),
        origin: "http://127.0.0.1:3100".into(),
        operator_key: None,
    });
    let router = router(app);
    let request = |path: &str, body: &str, origin: &str| {
        axum::http::Request::builder()
            .method("POST")
            .uri(path)
            .header("origin", origin)
            .header("cookie", "maple_session=test-session")
            .header("content-type", "application/json")
            .body(Body::from(body.to_owned()))
            .unwrap()
    };
    let response = router
        .clone()
        .oneshot(request(
            "/api/profile",
            r#"{"primary":"새대표","favorites":["외부"]}"#,
            "http://127.0.0.1:3100",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let primary: String = sqlx::query_scalar("SELECT primary_name FROM users WHERE id='test-b'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(primary, "B");
    let basic = json!({"character_name":"새대표","character_level":281,"character_exp":100,"character_exp_rate":"0.1","world_name":"스카니아","character_class":"은월"});
    sqlx::query(
        "INSERT INTO characters(ocid,name,basic,observed_at) VALUES('test-ocid','새대표',$1,now())",
    )
    .bind(&basic)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO observations VALUES('test-ocid',now(),$1)")
        .bind(&basic)
        .execute(&pool)
        .await
        .unwrap();
    let response = router
        .clone()
        .oneshot(request(
            "/api/profile",
            r#"{"primary":"A","favorites":[],"apiKey":"DO-NOT-STORE"}"#,
            "http://127.0.0.1:3100",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let response = router
        .clone()
        .oneshot(request("/api/activity", "{}", "https://evil.invalid"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = router
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/dashboard")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let response = router
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/dashboard")
                .header("cookie", "maple_session=test-session")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), 100000).await.unwrap();
    assert!(!String::from_utf8_lossy(&body).contains("DO-NOT-STORE"));
}
