// 실제 PostgreSQL에서 계정 격리와 개인 키 업로드 차단을 검증합니다.
use crate::*;
use axum::body::{to_bytes, Body};
use tower::ServiceExt;

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
