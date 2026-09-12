// 루프백 전용 운영 화면에 비밀정보 없는 수집 상태를 제공합니다.
use crate::*;
use axum::response::Html;
use sqlx::Row;

pub fn router(app: Arc<App>) -> Router {
    Router::new().route("/", get(|| async { Html(include_str!("operations.html")) }))
        .route("/status", get(status)).with_state(app)
        .layer(middleware::from_fn(|request: Request, next: Next| async move {
            let mut response = next.run(request).await;
            response.headers_mut().insert("cache-control", "no-store".parse().unwrap());
            response.headers_mut().insert("x-content-type-options", "nosniff".parse().unwrap());
            response.headers_mut().insert("content-security-policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'".parse().unwrap());
            response
        }))
}

async fn status(State(app): State<Arc<App>>) -> Json<serde_json::Value> {
    let mut result = json!({"checkedAt":chrono::Utc::now(),"database":false,
        "collectorConfigured":app.operator_key.is_some(),"origin":app.origin,
        "edgeConfigured":crate::edge_sync::configured(),"edgeOutbox":null,
        "publicVerified":false,"intervalMinutes":15,"runs":[],"usageConnected":false});
    if let Some(pool) = &app.db {
        if let Ok(rows) = sqlx::query("SELECT id,started_at,finished_at,status,succeeded,failed FROM sync_runs ORDER BY id DESC LIMIT 20").fetch_all(pool).await {
            result["database"] = json!(true);
            result["runs"] = json!(rows.into_iter().map(|r|json!({
                "id":r.get::<i64,_>("id"),"startedAt":r.get::<chrono::DateTime<chrono::Utc>,_>("started_at"),
                "finishedAt":r.get::<Option<chrono::DateTime<chrono::Utc>>,_>("finished_at"),
                "status":r.get::<String,_>("status"),"succeeded":r.get::<i32,_>("succeeded"),"failed":r.get::<i32,_>("failed")
            })).collect::<Vec<_>>());
        }
        if let Ok(outbox) = sqlx::query("SELECT batch_id,attempts,created_at,updated_at,last_attempt_at,last_error FROM edge_outbox WHERE slot=1").fetch_optional(pool).await {
            result["edgeOutbox"] = outbox.map(|row| json!({
                "batchId":row.get::<String,_>("batch_id"),"attempts":row.get::<i32,_>("attempts"),
                "createdAt":row.get::<chrono::DateTime<chrono::Utc>,_>("created_at"),"updatedAt":row.get::<chrono::DateTime<chrono::Utc>,_>("updated_at"),
                "lastAttemptAt":row.get::<Option<chrono::DateTime<chrono::Utc>>,_>("last_attempt_at"),"lastError":row.get::<Option<String>,_>("last_error")
            })).into();
        }
    }
    Json(result)
}

#[tokio::test]
async fn missing_database_is_not_reported_healthy() {
    let app = Arc::new(App {db:None,http:reqwest::Client::new(),origin:"http://127.0.0.1:3100".into(),operator_key:Some("secret-test-value".into()),nexon_origin:"http://localhost".into()});
    let value = status(State(app)).await.0;
    assert_eq!(value["database"],false);
    assert_eq!(value["collectorConfigured"],true);
    assert_eq!(value["edgeConfigured"],false);
    assert_eq!(value["publicVerified"],false);
    assert!(!value.to_string().contains("secret-test-value"));
}
