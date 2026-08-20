// 앱 명령과 저장소 사이에서 공유하는 데이터 구조를 정의합니다.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterBasic {
    pub date: Option<String>,
    pub character_name: String,
    pub world_name: String,
    pub character_class: String,
    pub character_level: i64,
    pub character_exp: i64,
    pub character_exp_rate: String,
    pub character_guild_name: Option<String>,
    #[serde(default)]
    pub character_image: Option<String>,
    pub access_flag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupResult {
    pub character_name: String,
    pub world_name: String,
    pub guild_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStatus {
    pub configured: bool,
    pub primary_name: Option<String>,
    pub world_name: Option<String>,
    pub guild_name: Option<String>,
    pub latest_date: Option<String>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankingRow {
    pub character_id: i64,
    pub rank: usize,
    pub character_name: String,
    pub character_class: String,
    pub character_image: Option<String>,
    pub level: i64,
    pub gained_exp: Option<i64>,
    pub gap_from_primary: Option<i64>,
    pub is_primary: bool,
    pub is_favorite: bool,
    pub is_current_member: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesPoint {
    pub date: String,
    pub character_name: String,
    pub gained_exp: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub latest_date: Option<String>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub primary_daily_exp: Option<i64>,
    pub primary_period_exp: Option<i64>,
    pub primary_rank: Option<usize>,
    pub leader_gap: Option<i64>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardData {
    pub summary: DashboardSummary,
    pub rankings: Vec<RankingRow>,
    pub series: Vec<SeriesPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub phase: String,
    pub completed: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub target_start: String,
    pub target_end: String,
    pub success_count: usize,
    pub failure_count: usize,
    pub unresolved_characters: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub character_id: i64,
    pub date: String,
    pub level: i64,
    pub exp: i64,
    pub exp_rate: String,
    pub access_flag: Option<String>,
    pub raw_json: String,
}

#[derive(Debug, Clone)]
pub struct CharacterRecord {
    pub id: i64,
    pub ocid: String,
}
