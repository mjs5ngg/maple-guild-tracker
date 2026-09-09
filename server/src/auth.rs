// 소셜 인증을 브라우저에 결합하고 제공자 고유 식별자로 계정을 생성합니다.
use crate::*;
use axum::{
    extract::{Path, Query},
    response::Redirect,
};
use serde::Deserialize;
use uuid::Uuid;

struct Provider {
    id: String,
    secret: String,
    authorize: &'static str,
    token: &'static str,
    profile: &'static str,
}
fn provider(name: &str) -> Option<Provider> {
    let (prefix, authorize, token, profile) = match name {
        "google" => (
            "GOOGLE",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "https://openidconnect.googleapis.com/v1/userinfo",
        ),
        "kakao" => (
            "KAKAO",
            "https://kauth.kakao.com/oauth/authorize",
            "https://kauth.kakao.com/oauth/token",
            "https://kapi.kakao.com/v2/user/me",
        ),
        "naver" => (
            "NAVER",
            "https://nid.naver.com/oauth2.0/authorize",
            "https://nid.naver.com/oauth2.0/token",
            "https://openapi.naver.com/v1/nid/me",
        ),
        _ => return None,
    };
    let id = std::env::var(format!("{prefix}_CLIENT_ID"))
        .ok()
        .filter(|v| !v.is_empty())?;
    let secret = std::env::var(format!("{prefix}_CLIENT_SECRET"))
        .ok()
        .filter(|v| !v.is_empty())?;
    Some(Provider {
        id,
        secret,
        authorize,
        token,
        profile,
    })
}
pub fn available() -> serde_json::Value {
    json!(["google", "kakao", "naver"]
        .map(|name| json!({"name":name,"configured":provider(name).is_some()})))
}
fn set_cookie(app: &App, name: &str, value: &str, age: i64) -> String {
    format!(
        "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{}",
        if app.origin.starts_with("https:") {
            "; Secure"
        } else {
            ""
        }
    )
}

// 소셜 로그인 없이 기기별 수집 구독을 만들며 계정 쿠키는 변경하지 않습니다.
pub async fn device(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Response, Failure> {
    if user(&app, &headers).await.is_ok() {
        return Ok(Json(json!({"ok":true})).into_response());
    }
    if cookie(&headers, "maple_session").is_some() {
        return Err(Failure(StatusCode::UNAUTHORIZED, "로그인이 만료되었습니다. 로그아웃 후 다시 시도하세요."));
    }
    let id = Uuid::new_v4().to_string();
    let token = Uuid::new_v4().to_string() + &Uuid::new_v4().to_string();
    let mut tx = app.pool()?.begin().await?;
    sqlx::query("INSERT INTO users(id) VALUES($1)").bind(&id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')")
        .bind(hash(&token)).bind(&id).execute(&mut *tx).await?;
    tx.commit().await?;
    let mut response = Json(json!({"ok":true})).into_response();
    response.headers_mut().insert("set-cookie", set_cookie(&app,"maple_device",&token,30*86400).parse().unwrap());
    Ok(response)
}
pub async fn start(
    State(app): State<Arc<App>>,
    Path(name): Path<String>,
    headers: HeaderMap,
    Query(options): Query<std::collections::HashMap<String, String>>,
) -> Result<Response, Failure> {
    let p = provider(&name).ok_or(Failure(
        StatusCode::SERVICE_UNAVAILABLE,
        "이 로그인 제공자는 아직 설정되지 않았습니다.",
    ))?;
    let state = Uuid::new_v4().to_string();
    let browser = Uuid::new_v4().to_string();
    sqlx::query("DELETE FROM login_attempts WHERE expires_at<=now()")
        .execute(app.pool()?)
        .await?;
    let link_user = if options.get("link").map(String::as_str) == Some("1") {
        if cookie(&headers, "maple_session").is_none() {
            return Err(Failure(StatusCode::UNAUTHORIZED, "계정 연결은 로그인 후 가능합니다."));
        }
        Some(user(&app, &headers).await?)
    } else {
        None
    };
    sqlx::query("INSERT INTO login_attempts(state_hash,provider,browser_hash,expires_at,link_user) VALUES($1,$2,$3,now()+interval '10 minutes',$4)")
        .bind(hash(&state))
        .bind(&name)
        .bind(hash(&browser))
        .bind(link_user)
        .execute(app.pool()?)
        .await?;
    let mut url = reqwest::Url::parse(p.authorize).unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", &p.id)
        .append_pair("response_type", "code")
        .append_pair(
            "redirect_uri",
            &format!("{}/auth/{name}/callback", app.origin),
        )
        .append_pair("state", &state);
    if name == "google" {
        url.query_pairs_mut().append_pair("scope", "openid");
    }
    let mut response = Redirect::to(url.as_str()).into_response();
    response.headers_mut().insert(
        "set-cookie",
        set_cookie(&app, "maple_login", &browser, 600)
            .parse()
            .unwrap(),
    );
    Ok(response)
}
#[derive(Deserialize)]
pub struct Callback {
    code: Option<String>,
    state: Option<String>,
}
pub async fn callback(
    State(app): State<Arc<App>>,
    Path(name): Path<String>,
    headers: HeaderMap,
    Query(input): Query<Callback>,
) -> Result<Response, Failure> {
    let denied = || {
        Failure(
            StatusCode::BAD_REQUEST,
            "로그인을 확인하지 못했습니다. 다시 시도해 주세요.",
        )
    };
    let p = provider(&name).ok_or_else(denied)?;
    let browser = cookie(&headers, "maple_login").ok_or_else(denied)?;
    let state = input.state.ok_or_else(denied)?;
    let code = input.code.ok_or_else(denied)?;
    let matched:Option<Option<String>>=sqlx::query_scalar("DELETE FROM login_attempts WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>now() RETURNING link_user")
        .bind(hash(&state)).bind(hash(&browser)).bind(&name).fetch_optional(app.pool()?).await?;
    if matched.is_none() {
        return Err(denied());
    }
    let link_user = matched.flatten();
    if let Some(ref link) = link_user {
        if user(&app, &headers).await? != *link {
            return Err(denied());
        }
    }
    let redirect = format!("{}/auth/{name}/callback", app.origin);
    let token = app
        .http
        .post(p.token)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", p.id.as_str()),
            ("client_secret", p.secret.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("state", state.as_str()),
        ])
        .send()
        .await
        .map_err(|_| denied())?
        .error_for_status()
        .map_err(|_| denied())?
        .json::<serde_json::Value>()
        .await
        .map_err(|_| denied())?;
    let access = token["access_token"].as_str().ok_or_else(denied)?;
    let profile = app
        .http
        .get(p.profile)
        .bearer_auth(access)
        .send()
        .await
        .map_err(|_| denied())?
        .error_for_status()
        .map_err(|_| denied())?
        .json::<serde_json::Value>()
        .await
        .map_err(|_| denied())?;
    let subject = match name.as_str() {
        "google" => profile["sub"].as_str().map(str::to_owned),
        "kakao" => profile["id"].as_u64().map(|id| id.to_string()),
        "naver" => {
            if profile["resultcode"] == "00" {
                profile["response"]["id"].as_str().map(str::to_owned)
            } else {
                None
            }
        }
        _ => None,
    }
    .ok_or_else(denied)?;
    let mut tx = app.pool()?.begin().await?;
    // 같은 제공자 계정의 동시 최초 로그인도 단일 사용자로 직렬화합니다.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(format!("{name}:{subject}"))
        .execute(&mut *tx)
        .await?;
    let existing: Option<String> =
        sqlx::query_scalar("SELECT user_id FROM identities WHERE provider=$1 AND subject=$2")
            .bind(&name)
            .bind(&subject)
            .fetch_optional(&mut *tx)
            .await?;
    let id = if let Some(link) = link_user {
        if existing.as_ref().is_some_and(|id| id != &link) {
            return Err(Failure(
                StatusCode::CONFLICT,
                "이미 다른 서비스 계정에 연결된 로그인입니다.",
            ));
        }
        if existing.is_none() {
            sqlx::query("INSERT INTO identities VALUES($1,$2,$3)")
                .bind(&name)
                .bind(&subject)
                .bind(&link)
                .execute(&mut *tx)
                .await?;
        }
        link
    } else if let Some(id) = existing {
        id
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO users(id) VALUES($1)")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO identities VALUES($1,$2,$3)")
            .bind(&name)
            .bind(subject)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        id
    };
    sqlx::query("UPDATE users SET last_active=now() WHERE id=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    let session = Uuid::new_v4().to_string() + &Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')")
        .bind(hash(&session))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let mut response = Redirect::to("/").into_response();
    response.headers_mut().append(
        "set-cookie",
        set_cookie(&app, "maple_session", &session, 30 * 86400)
            .parse()
            .unwrap(),
    );
    response.headers_mut().append(
        "set-cookie",
        set_cookie(&app, "maple_login", "", 0).parse().unwrap(),
    );
    Ok(response)
}
pub async fn logout(State(app): State<Arc<App>>, headers: HeaderMap) -> Result<Response, Failure> {
    if let Some(token) = cookie(&headers, "maple_session") {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(hash(&token))
            .execute(app.pool()?)
            .await?;
    }
    let mut response = Json(json!({"ok":true})).into_response();
    response.headers_mut().insert(
        "set-cookie",
        set_cookie(&app, "maple_session", "", 0).parse().unwrap(),
    );
    Ok(response)
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteAccount {
    confirmation: String,
}
pub async fn delete_account(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(input): Json<DeleteAccount>,
) -> Result<Response, Failure> {
    if cookie(&headers, "maple_session").is_none() {
        return Err(Failure(StatusCode::UNAUTHORIZED, "계정 탈퇴는 로그인 후 가능합니다."));
    }
    let id = user(&app, &headers).await?;
    if input.confirmation != "탈퇴" {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "탈퇴 확인 문구를 입력하세요.",
        ));
    }
    let mut tx = app.pool()?.begin().await?;
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;
    for query in [
        "DELETE FROM login_attempts WHERE link_user=$1",
        "DELETE FROM sessions WHERE user_id=$1",
        "DELETE FROM identities WHERE user_id=$1",
        "DELETE FROM favorites WHERE user_id=$1",
        "DELETE FROM users WHERE id=$1",
    ] {
        sqlx::query(query).bind(&id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    let mut response = Json(json!({"ok":true})).into_response();
    for name in ["maple_session", "maple_login"] {
        response
            .headers_mut()
            .append("set-cookie", set_cookie(&app, name, "", 0).parse().unwrap());
    }
    Ok(response)
}
