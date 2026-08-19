// NEXON Open API 호출과 오류 분류·제한 재시도를 처리합니다.
use std::time::Duration;

use reqwest::StatusCode;
use serde::{de::DeserializeOwned, Deserialize};

use crate::{models::CharacterBasic, AppError};

const DEFAULT_BASE_URL: &str = "https://open.api.nexon.com";

#[derive(Clone)]
pub struct NexonClient {
    client: reqwest::Client,
    base_url: String,
}

#[derive(Debug, Deserialize)]
struct OcidResponse {
    ocid: String,
}

#[derive(Debug, Deserialize)]
struct GuildIdResponse {
    oguild_id: String,
}

#[derive(Debug, Deserialize)]
pub struct GuildBasicResponse {
    pub guild_member: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    error: Option<ApiErrorDetail>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorDetail {
    name: Option<String>,
    message: Option<String>,
}

impl NexonClient {
    pub fn new() -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("maple-guild-tracker/0.1")
            .build()?;
        Ok(Self {
            client,
            base_url: DEFAULT_BASE_URL.to_string(),
        })
    }

    async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        api_key: &str,
        query: &[(&str, &str)],
    ) -> Result<T, AppError> {
        let mut delay_ms = 400_u64;
        for attempt in 0..4 {
            let response = self
                .client
                .get(format!("{}{}", self.base_url, path))
                .header("x-nxopen-api-key", api_key)
                .query(query)
                .send()
                .await?;
            let status = response.status();
            let body = response.text().await?;
            if status.is_success() {
                return serde_json::from_str(&body).map_err(AppError::from);
            }

            let parsed = serde_json::from_str::<ApiErrorBody>(&body).ok();
            let detail = parsed.as_ref().and_then(|value| value.error.as_ref());
            let code = detail
                .and_then(|value| value.name.clone())
                .unwrap_or_else(|| status.as_u16().to_string());
            let message = detail
                .and_then(|value| value.message.clone())
                .unwrap_or_else(|| "NEXON Open API 요청에 실패했습니다.".to_string());
            let retryable = status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
            if retryable && attempt < 3 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                delay_ms *= 2;
                continue;
            }
            return Err(AppError::Api {
                code,
                message,
                status: status.as_u16(),
            });
        }
        Err(AppError::Validation(
            "API 재시도 횟수를 초과했습니다.".into(),
        ))
    }

    pub async fn ocid(&self, api_key: &str, name: &str) -> Result<String, AppError> {
        let response: OcidResponse = self
            .get("/maplestory/v1/id", api_key, &[("character_name", name)])
            .await?;
        Ok(response.ocid)
    }

    pub async fn character_basic(
        &self,
        api_key: &str,
        ocid: &str,
        date: Option<&str>,
    ) -> Result<CharacterBasic, AppError> {
        let mut query = vec![("ocid", ocid)];
        if let Some(date) = date {
            query.push(("date", date));
        }
        self.get("/maplestory/v1/character/basic", api_key, &query)
            .await
    }

    pub async fn guild_id(
        &self,
        api_key: &str,
        guild_name: &str,
        world_name: &str,
    ) -> Result<String, AppError> {
        let response: GuildIdResponse = self
            .get(
                "/maplestory/v1/guild/id",
                api_key,
                &[("guild_name", guild_name), ("world_name", world_name)],
            )
            .await?;
        Ok(response.oguild_id)
    }

    pub async fn guild_basic(
        &self,
        api_key: &str,
        oguild_id: &str,
        date: &str,
    ) -> Result<GuildBasicResponse, AppError> {
        self.get(
            "/maplestory/v1/guild/basic",
            api_key,
            &[("oguild_id", oguild_id), ("date", date)],
        )
        .await
    }
}
