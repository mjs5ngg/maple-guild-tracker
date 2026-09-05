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
    pub current_exp: Option<i64>,
    pub gained_exp: Option<i64>,
    pub current_exp_rate: Option<f64>,
    pub today_exp: Option<i64>,
    pub gap_from_primary: Option<i64>,
    pub is_primary: bool,
    pub is_favorite: bool,
    pub is_current_member: bool,
    pub status: String,
    pub is_hunting: bool,
    pub live_updated_at: Option<String>,
}

pub fn compare_current_position(left: &RankingRow, right: &RankingRow) -> std::cmp::Ordering {
    right
        .level
        .cmp(&left.level)
        .then_with(|| right.current_exp.cmp(&left.current_exp))
        .then_with(|| left.character_name.cmp(&right.character_name))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesPoint {
    pub date: String,
    pub character_id: i64,
    pub character_name: String,
    pub gained_exp: Option<i64>,
    pub level: Option<i64>,
    pub exp_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub latest_date: Option<String>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub primary_daily_exp: Option<i64>,
    pub primary_period_exp: Option<i64>,
    pub primary_current_exp_rate: Option<f64>,
    pub primary_today_exp: Option<i64>,
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

#[cfg(any(target_os = "android", test))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileWidgetCharacter {
    pub character_id: i64,
    pub rank: usize,
    pub character_name: String,
    pub character_class: String,
    pub character_image: Option<String>,
    pub level: i64,
    pub current_exp_rate: Option<f64>,
    pub today_exp: Option<i64>,
    pub is_primary: bool,
}

#[cfg(any(target_os = "android", test))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileWidgetSnapshot {
    pub updated_at: Option<String>,
    pub characters: Vec<MobileWidgetCharacter>,
    pub primary_weekly_exp: Option<i64>,
    pub primary_weekly_points: Vec<MobileWidgetDailyPoint>,
    pub primary_daily_average_exp: Option<i64>,
    pub primary_remaining_exp: Option<i64>,
    pub primary_estimated_days: Option<i64>,
}

#[cfg(any(target_os = "android", test))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileWidgetDailyPoint {
    pub date: String,
    pub level: Option<i64>,
    pub exp_rate: Option<f64>,
    pub gained_exp: Option<i64>,
}

#[cfg(any(target_os = "android", test))]
impl DashboardData {
    pub fn mobile_widget_snapshot(&self) -> MobileWidgetSnapshot {
        let updated_at = self
            .rankings
            .iter()
            .filter_map(|row| row.live_updated_at.as_ref())
            .max()
            .cloned()
            .or_else(|| self.summary.last_sync_at.clone());
        let mut rows: Vec<&RankingRow> = self
            .rankings
            .iter()
            .filter(|row| row.is_primary || row.is_favorite)
            .collect();
        rows.sort_by(|left, right| {
            right
                .today_exp
                .cmp(&left.today_exp)
                .then_with(|| compare_current_position(left, right))
        });
        let primary_id = rows
            .iter()
            .find(|row| row.is_primary)
            .map(|row| row.character_id);
        let mut weekly_points: Vec<&SeriesPoint> = self
            .series
            .iter()
            .filter(|point| Some(point.character_id) == primary_id)
            .collect();
        weekly_points.sort_by(|left, right| left.date.cmp(&right.date));
        let primary_weekly_points: Vec<MobileWidgetDailyPoint> = weekly_points
            .into_iter()
            .rev()
            .take(7)
            .map(|point| MobileWidgetDailyPoint {
                date: point.date.clone(),
                level: point.level,
                exp_rate: point.exp_rate,
                gained_exp: point.gained_exp,
            })
            .collect();
        let mut primary_weekly_points = primary_weekly_points;
        primary_weekly_points.reverse();
        if let Some(baseline) = primary_weekly_points.first_mut() {
            baseline.gained_exp = None;
        }
        let available: Vec<i64> = primary_weekly_points
            .iter()
            .filter_map(|point| point.gained_exp)
            .collect();
        let primary_weekly_exp = (!available.is_empty()).then(|| available.iter().sum());
        let primary_daily_average_exp =
            (!available.is_empty()).then(|| available.iter().sum::<i64>() / available.len() as i64);
        let primary_remaining_exp = rows.iter().find(|row| row.is_primary).and_then(|row| {
            crate::exp::required_exp(row.level)
                .zip(row.current_exp)
                .map(|(required, current)| required.saturating_sub(current))
        });
        let primary_estimated_days = primary_remaining_exp
            .zip(primary_daily_average_exp)
            .filter(|(_, average)| *average > 0)
            .map(|(remaining, average)| (remaining as f64 / average as f64).ceil() as i64);
        MobileWidgetSnapshot {
            updated_at,
            characters: rows
                .into_iter()
                .enumerate()
                .map(|(index, row)| MobileWidgetCharacter {
                    character_id: row.character_id,
                    rank: index + 1,
                    character_name: row.character_name.clone(),
                    character_class: row.character_class.clone(),
                    character_image: row.character_image.clone(),
                    level: row.level,
                    current_exp_rate: row.current_exp_rate,
                    today_exp: row.today_exp,
                    is_primary: row.is_primary,
                })
                .collect(),
            primary_weekly_exp,
            primary_weekly_points,
            primary_daily_average_exp,
            primary_remaining_exp,
            primary_estimated_days,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn ranking(name: &str, today_exp: Option<i64>, primary: bool, favorite: bool) -> RankingRow {
        RankingRow {
            character_id: name.len() as i64,
            rank: 0,
            character_name: name.into(),
            character_class: "은월".into(),
            character_image: None,
            level: if primary { 281 } else { 280 },
            current_exp: Some(1),
            gained_exp: today_exp,
            current_exp_rate: Some(30.0),
            today_exp,
            gap_from_primary: None,
            is_primary: primary,
            is_favorite: favorite,
            is_current_member: true,
            status: "정상".into(),
            is_hunting: false,
            live_updated_at: None,
        }
    }

    #[test]
    fn widget_snapshot_includes_primary_and_favorites_in_today_order() {
        let data = DashboardData {
            summary: DashboardSummary {
                latest_date: None,
                period_start: None,
                period_end: None,
                primary_daily_exp: None,
                primary_period_exp: None,
                primary_current_exp_rate: None,
                primary_today_exp: None,
                primary_rank: None,
                leader_gap: None,
                last_sync_at: Some("2026-08-26 10:00:00".into()),
            },
            rankings: vec![
                ranking("대표", Some(10), true, false),
                ranking("즐겨찾기", Some(30), false, true),
                ranking("일반", Some(100), false, false),
            ],
            series: (1..=8)
                .map(|day| SeriesPoint {
                    date: format!("2026-08-{day:02}"),
                    character_id: "대표".len() as i64,
                    character_name: "대표".into(),
                    gained_exp: Some(day * 10),
                    level: Some(281),
                    exp_rate: Some(day as f64),
                })
                .collect(),
        };

        let snapshot = data.mobile_widget_snapshot();
        assert_eq!(snapshot.characters.len(), 2);
        assert_eq!(snapshot.characters[0].character_name, "즐겨찾기");
        assert_eq!(snapshot.characters[0].rank, 1);
        assert_eq!(snapshot.characters[1].character_name, "대표");
        assert!(snapshot.characters[1].is_primary);
        assert_eq!(snapshot.primary_weekly_points.len(), 7);
        assert_eq!(snapshot.primary_weekly_points[0].gained_exp, None);
        assert_eq!(snapshot.primary_weekly_points[6].gained_exp, Some(80));
        assert_eq!(snapshot.primary_weekly_exp, Some(330));
        assert_eq!(snapshot.primary_daily_average_exp, Some(55));
        assert_eq!(
            snapshot.primary_remaining_exp,
            crate::exp::required_exp(281).map(|required| required - 1)
        );
        assert_eq!(
            snapshot.primary_estimated_days,
            snapshot
                .primary_remaining_exp
                .map(|remaining| (remaining as f64 / 55.0).ceil() as i64)
        );
    }
}
