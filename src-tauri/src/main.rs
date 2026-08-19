// 데스크톱 실행 파일에서 Tauri 애플리케이션을 시작합니다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    maple_guild_tracker_lib::run();
}
