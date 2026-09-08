// 로컬 웹 서버와 PostgreSQL 연결 및 안전한 공통 응답을 구성합니다.
mod auth;
mod backfill;
mod collector;
#[allow(dead_code)]
#[path = "../../src-tauri/src/exp.rs"]
mod exp;
mod guild_history;
mod operator_key;
mod policy;
mod records;
mod routes;

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::{sync::Arc, time::Duration};

#[derive(Clone)]
pub struct App {
    #[cfg(test)]
    nexon_origin: String,
    db: Option<PgPool>,
    http: reqwest::Client,
    origin: String,
    operator_key: Option<String>,
}
type ApiResult<T> = Result<Json<T>, Failure>;
pub struct Failure(StatusCode, &'static str);
impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
impl From<sqlx::Error> for Failure {
    fn from(_: sqlx::Error) -> Self {
        Self(
            StatusCode::SERVICE_UNAVAILABLE,
            "저장소 작업에 실패했습니다.",
        )
    }
}
impl App {
    fn pool(&self) -> Result<&PgPool, Failure> {
        self.db.as_ref().ok_or(Failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "PostgreSQL 연결 설정이 필요합니다.",
        ))
    }
}
fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get("cookie")?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|p| {
            let (k, v) = p.trim().split_once('=')?;
            (k == name).then(|| v.to_owned())
        })
}
async fn user(app: &App, headers: &HeaderMap) -> Result<String, Failure> {
    let token = cookie(headers, "maple_session")
        .ok_or(Failure(StatusCode::UNAUTHORIZED, "로그인이 필요합니다."))?;
    sqlx::query_scalar("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()")
        .bind(hash(&token))
        .fetch_optional(app.pool()?)
        .await?
        .ok_or(Failure(
            StatusCode::UNAUTHORIZED,
            "로그인이 만료되었습니다.",
        ))
}
async fn guard(State(app): State<Arc<App>>, request: Request, next: Next) -> Response {
    if request.method() != axum::http::Method::GET
        && request.method() != axum::http::Method::HEAD
        && request
            .headers()
            .get("origin")
            .and_then(|v| v.to_str().ok())
            != Some(app.origin.as_str())
    {
        return Failure(StatusCode::FORBIDDEN, "허용하지 않는 요청 출처입니다.").into_response();
    }
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert("cache-control", "no-store".parse().unwrap());
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    headers.insert("referrer-policy", "no-referrer".parse().unwrap());
    headers.insert("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://open.api.nexon.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'".parse().unwrap());
    response
}
fn parse_port(value: Option<&str>, default: u16) -> Result<u16, &'static str> {
    match value {
        None => Ok(default),
        Some(value) => value.parse::<u16>().ok().filter(|port| *port != 0)
            .ok_or("port must be an integer from 1 to 65535"),
    }
}

#[test]
fn configured_ports_are_valid() {
    assert_eq!(parse_port(None, 3100), Ok(3100));
    assert_eq!(parse_port(Some("3200"), 3100), Ok(3200));
    for value in ["0", "65536", "-1", "invalid", ""] {
        assert!(parse_port(Some(value), 3100).is_err());
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let server_port = parse_port(std::env::var("SERVER_PORT").ok().as_deref(), 3100)
        .expect("invalid SERVER_PORT");
    let direct_port = parse_port(std::env::var("DIRECT_PORT").ok().as_deref(), 3101)
        .expect("invalid DIRECT_PORT");
    assert_ne!(server_port, direct_port, "server ports must differ");
    let origin = std::env::var("PUBLIC_ORIGIN").unwrap_or("http://127.0.0.1:3100".into());
    let parsed = reqwest::Url::parse(&origin).expect("PUBLIC_ORIGIN URL");
    assert!(
        parsed.origin().ascii_serialization() == origin,
        "PUBLIC_ORIGIN must be an origin without path"
    );
    assert!(
        parsed.scheme() == "https"
            || (parsed.scheme() == "http"
                && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"))),
        "HTTPS required outside localhost"
    );
    let db = if let Ok(url) = std::env::var("DATABASE_URL") {
        match sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&url)
            .await
        {
            Ok(pool) => {
                sqlx::migrate!("./migrations")
                    .run(&pool)
                    .await
                    .expect("database migration failed");
                Some(pool)
            }
            Err(_) => {
                eprintln!("PostgreSQL 연결 실패. 연결 정보를 확인하세요.");
                None
            }
        }
    } else {
        None
    };
    let app = Arc::new(App {
        #[cfg(test)]
        nexon_origin: "https://open.api.nexon.com".into(),
        db,
        http: reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap(),
        origin,
        operator_key: operator_key::load(),
    });
    if std::env::args().any(|arg| arg == "--check-operator-key") {
        let Some(key) = app.operator_key.as_deref() else {
            eprintln!("운영자 키를 읽지 못했습니다.");
            std::process::exit(1);
        };
        let result = app
            .http
            .get("https://open.api.nexon.com/maplestory/v1/id")
            .query(&[("character_name", "엘크라우치")])
            .header("x-nxopen-api-key", key)
            .send()
            .await;
        match result {
            Ok(response) if response.status().is_success() => {
                println!("NEXON 운영자 키 조회 검증 성공 (HTTP 200)")
            }
            Ok(response) => {
                eprintln!(
                    "NEXON 운영자 키 조회 검증 실패 (HTTP {})",
                    response.status().as_u16()
                );
                std::process::exit(1);
            }
            Err(_) => {
                eprintln!("NEXON 검증 요청의 네트워크 오류");
                std::process::exit(1);
            }
        }
        return;
    }
    if app.db.is_some() && app.operator_key.is_some() {
        tokio::spawn(collector::run(app.clone()));
    }
    let router = router(app);
    let direct=Router::new()
        .fallback_service(tower_http::services::ServeDir::new("web-dist/direct"))
        .layer(middleware::from_fn(|request:Request,next:Next| async move {
            let mut response=next.run(request).await;
            response.headers_mut().insert("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src https://open.api.nexon.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'".parse().unwrap());
            response.headers_mut().insert("referrer-policy","no-referrer".parse().unwrap());
            response.headers_mut().insert("cache-control","no-store".parse().unwrap());
            response.headers_mut().insert("x-content-type-options","nosniff".parse().unwrap());
            response
        }));
    let direct_listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, direct_port))
        .await
        .expect("direct loopback port unavailable");
    tokio::spawn(async move {
        axum::serve(direct_listener, direct)
            .await
            .expect("direct server failed");
    });
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, server_port))
        .await
        .expect("server loopback port unavailable");
    println!("Maple EXP server http://127.0.0.1:{server_port}");
    axum::serve(listener, router).await.unwrap();
}
fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/api/status", get(routes::status))
        .route("/api/me", get(routes::me))
        .route("/api/activity", post(routes::activity))
        .route("/api/profile", post(routes::profile))
        .route("/api/dashboard", get(routes::dashboard))
        .route("/auth/{provider}/start", get(auth::start))
        .route("/auth/{provider}/callback", get(auth::callback))
        .route("/api/logout", post(auth::logout))
        .route("/api/account/delete", post(auth::delete_account))
        .fallback_service(tower_http::services::ServeDir::new("web-dist/dashboard"))
        .layer(axum::extract::DefaultBodyLimit::max(8192))
        .layer(middleware::from_fn_with_state(app.clone(), guard))
        .with_state(app)
}

#[cfg(test)]
mod tests;
