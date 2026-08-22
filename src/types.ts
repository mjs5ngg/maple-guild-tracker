// 네이티브 명령에서 반환되는 앱 데이터 구조를 정의합니다.
export interface AppStatus {
  configured: boolean;
  primary_name: string | null;
  world_name: string | null;
  guild_name: string | null;
  latest_date: string | null;
  last_sync_at: string | null;
}

export interface SetupResult {
  character_name: string;
  world_name: string;
  guild_name: string;
}

export interface RankingRow {
  character_id: number;
  rank: number;
  character_name: string;
  character_class: string;
  character_image: string | null;
  level: number;
  current_exp: number | null;
  gained_exp: number | null;
  current_exp_rate: number | null;
  today_exp: number | null;
  gap_from_primary: number | null;
  is_primary: boolean;
  is_favorite: boolean;
  is_current_member: boolean;
  status: string;
  is_hunting: boolean;
  live_updated_at: string | null;
}

export interface SeriesPoint {
  date: string;
  character_id: number;
  character_name: string;
  gained_exp: number | null;
}

export interface DashboardData {
  summary: {
    latest_date: string | null;
    period_start: string | null;
    period_end: string | null;
    primary_daily_exp: number | null;
    primary_period_exp: number | null;
    primary_current_exp_rate: number | null;
    primary_today_exp: number | null;
    primary_rank: number | null;
    leader_gap: number | null;
    last_sync_at: string | null;
  };
  rankings: RankingRow[];
  series: SeriesPoint[];
}

export interface SyncProgress {
  phase: string;
  completed: number;
  total: number;
  message: string;
}

export interface SyncReport {
  target_start: string;
  target_end: string;
  success_count: number;
  failure_count: number;
  unresolved_characters: string[];
}
