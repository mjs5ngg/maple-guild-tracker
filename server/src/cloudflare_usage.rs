// Cloudflare 무료 제공량 대비 오늘(UTC 기준) 사용량을 읽기 전용 분석 토큰으로 조회합니다.
use chrono::{Duration, Utc};
use serde_json::{json, Value};

// Workers Free와 D1 Free의 일일·총량 한도입니다. 한도는 매일 00:00 UTC(09:00 KST)에 초기화됩니다.
const WORKER_REQUESTS_PER_DAY: u64 = 100_000;
const D1_ROWS_READ_PER_DAY: u64 = 5_000_000;
const D1_ROWS_WRITTEN_PER_DAY: u64 = 100_000;
const D1_STORAGE_BYTES: u64 = 5_000_000_000;

const QUERY: &str = "query Usage($account: string!, $date: Date!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end }) {
        sum { requests errors subrequests }
        dimensions { scriptName }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $date, date_leq: $date }) {
        sum { readQueries writeQueries rowsRead rowsWritten }
        dimensions { databaseId }
      }
      storage: d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $date, date_leq: $date }) {
        max { databaseSizeBytes }
        dimensions { databaseId }
      }
    }
  }
}";

struct Config {
    account: String,
    token: String,
}

fn config() -> Option<Config> {
    let account = std::env::var("CLOUDFLARE_ACCOUNT_ID")
        .ok()
        .filter(|value| value.len() == 32 && value.chars().all(|c| c.is_ascii_hexdigit()))?;
    let token = std::env::var("CLOUDFLARE_ANALYTICS_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())?;
    Some(Config { account, token: token.trim().to_owned() })
}

fn sum_field(rows: Option<&Value>, group: &str, field: &str) -> u64 {
    rows.and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get(group)?.get(field)?.as_u64())
                .sum()
        })
        .unwrap_or(0)
}

fn meter(used: u64, limit: u64) -> Value {
    let percent = if limit == 0 { 0.0 } else { used as f64 * 100.0 / limit as f64 };
    json!({"used":used,"limit":limit,"percent":(percent * 100.0).round() / 100.0})
}

pub(crate) fn summarize(account: &Value, measured_at: &str, reset_at: &str) -> Value {
    let workers = account.get("workers");
    let d1 = account.get("d1");
    let storage = account.get("storage");
    json!({
        "configured": true,
        "measuredAt": measured_at,
        "resetAt": reset_at,
        "workerRequests": meter(sum_field(workers, "sum", "requests"), WORKER_REQUESTS_PER_DAY),
        "workerErrors": sum_field(workers, "sum", "errors"),
        "d1RowsRead": meter(sum_field(d1, "sum", "rowsRead"), D1_ROWS_READ_PER_DAY),
        "d1RowsWritten": meter(sum_field(d1, "sum", "rowsWritten"), D1_ROWS_WRITTEN_PER_DAY),
        "d1Queries": sum_field(d1, "sum", "readQueries") + sum_field(d1, "sum", "writeQueries"),
        "d1Storage": meter(
            storage.and_then(Value::as_array).map(|rows| rows.iter()
                .filter_map(|row| row.get("max")?.get("databaseSizeBytes")?.as_u64()).sum()).unwrap_or(0),
            D1_STORAGE_BYTES,
        ),
    })
}

// 관리자가 새로고침할 때만 호출합니다. 분석 API 조회는 Workers·D1 무료 제공량을 쓰지 않습니다.
pub(crate) async fn usage(http: &reqwest::Client) -> Value {
    let Some(config) = config() else {
        return json!({"configured":false});
    };
    let now = Utc::now();
    let start = now.date_naive().and_hms_opt(0, 0, 0).expect("midnight").and_utc();
    let reset = start + Duration::days(1);
    let body = json!({"query":QUERY,"variables":{
        "account":config.account,
        "date":start.format("%Y-%m-%d").to_string(),
        "start":start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "end":now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    }});
    let response = match http
        .post("https://api.cloudflare.com/client/v4/graphql")
        .bearer_auth(&config.token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return json!({"configured":true,"error":"Cloudflare 분석 API에 연결하지 못했습니다."}),
    };
    let status = response.status();
    let Ok(value) = response.json::<Value>().await else {
        return json!({"configured":true,"error":format!("Cloudflare 응답을 해석하지 못했습니다(HTTP {}).", status.as_u16())});
    };
    if let Some(message) = value.get("errors").and_then(Value::as_array).and_then(|errors| errors.first())
        .and_then(|error| error.get("message")).and_then(Value::as_str)
    {
        return json!({"configured":true,"error":format!("Cloudflare 분석 API 오류: {message}")});
    }
    let Some(account) = value.pointer("/data/viewer/accounts/0") else {
        return json!({"configured":true,"error":"계정 분석 자료가 없습니다. 토큰 권한(Account Analytics: Read)을 확인하세요."});
    };
    summarize(
        account,
        &now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        &reset.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_every_script_and_database_against_free_limits() {
        let account = json!({
            "workers":[{"sum":{"requests":1200,"errors":3,"subrequests":0},"dimensions":{"scriptName":"maple-exp-public"}},
                       {"sum":{"requests":300,"errors":0,"subrequests":0},"dimensions":{"scriptName":"pages"}}],
            "d1":[{"sum":{"readQueries":40,"writeQueries":10,"rowsRead":50_000,"rowsWritten":1_000},"dimensions":{"databaseId":"a"}}],
            "storage":[{"max":{"databaseSizeBytes":23_000_000},"dimensions":{"databaseId":"a"}}]
        });
        let result = summarize(&account, "2026-09-19T08:00:00Z", "2026-09-20T00:00:00Z");
        assert_eq!(result["workerRequests"]["used"], 1500);
        assert_eq!(result["workerRequests"]["percent"], 1.5);
        assert_eq!(result["workerErrors"], 3);
        assert_eq!(result["d1RowsRead"]["percent"], 1.0);
        assert_eq!(result["d1RowsWritten"]["percent"], 1.0);
        assert_eq!(result["d1Queries"], 50);
        assert_eq!(result["d1Storage"]["used"], 23_000_000);
    }

    #[test]
    fn missing_groups_count_as_zero() {
        let result = summarize(&json!({}), "t", "r");
        assert_eq!(result["workerRequests"]["used"], 0);
        assert_eq!(result["d1Storage"]["percent"], 0.0);
    }
}
