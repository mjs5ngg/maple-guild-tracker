// 프런트엔드에서 호출하는 설정·동기화·조회 명령을 제공합니다.
use tauri::{AppHandle, Manager};
#[cfg(target_os = "windows")]
use tauri_plugin_autostart::ManagerExt;

use crate::{
    credential_set, db,
    models::{AppStatus, DashboardData, SetupResult, SyncReport},
    sync, AppError, AppState,
};

fn public_error(error: AppError) -> String {
    error.public_message()
}

#[tauri::command]
pub fn get_app_status(state: tauri::State<'_, AppState>) -> Result<AppStatus, String> {
    let connection = db::open(&state.db_path).map_err(public_error)?;
    db::app_status(&connection).map_err(public_error)
}

#[tauri::command]
pub async fn save_setup(
    _app: AppHandle,
    state: tauri::State<'_, AppState>,
    api_key: String,
    primary_name: String,
) -> Result<SetupResult, String> {
    let key = api_key.trim();
    let name = primary_name.trim();
    if key.is_empty() || name.is_empty() {
        return Err("API 키와 대표 캐릭터명을 모두 입력해 주세요.".into());
    }
    let ocid = state.nexon.ocid(key, name).await.map_err(public_error)?;
    let basic = state
        .nexon
        .character_basic(key, &ocid, None)
        .await
        .map_err(public_error)?;
    let guild_name = basic
        .character_guild_name
        .clone()
        .ok_or_else(|| "대표 캐릭터가 현재 길드에 가입되어 있지 않습니다.".to_string())?;
    let oguild_id = state
        .nexon
        .guild_id(key, &guild_name, &basic.world_name)
        .await
        .map_err(public_error)?;
    credential_set(key).map_err(public_error)?;
    let connection = db::open(&state.db_path).map_err(public_error)?;
    db::save_setup(&connection, &basic, &ocid, &guild_name, &oguild_id).map_err(public_error)?;
    #[cfg(target_os = "windows")]
    let _ = _app.autolaunch().enable();
    Ok(SetupResult {
        character_name: basic.character_name,
        world_name: basic.world_name,
        guild_name,
    })
}

#[tauri::command]
pub async fn sync_now(app: AppHandle, days: Option<u32>) -> Result<SyncReport, String> {
    sync::sync_all(app, days).await.map_err(public_error)
}

#[tauri::command]
pub async fn sync_live_now(app: AppHandle) -> Result<SyncReport, String> {
    sync::sync_live(app).await.map_err(public_error)
}

#[tauri::command]
pub fn change_primary(
    state: tauri::State<'_, AppState>,
    character_id: i64,
) -> Result<AppStatus, String> {
    let mut connection = db::open(&state.db_path).map_err(public_error)?;
    db::set_primary(&mut connection, character_id).map_err(public_error)?;
    db::app_status(&connection).map_err(public_error)
}

#[tauri::command]
pub async fn replace_api_key(
    state: tauri::State<'_, AppState>,
    api_key: String,
) -> Result<SetupResult, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("새 API 키를 입력해 주세요.".into());
    }
    let connection = db::open(&state.db_path).map_err(public_error)?;
    let primary_name = db::get_setting(&connection, "primary_name")
        .map_err(public_error)?
        .ok_or_else(|| "먼저 대표 캐릭터를 설정해 주세요.".to_string())?;
    drop(connection);
    let ocid = state
        .nexon
        .ocid(key, &primary_name)
        .await
        .map_err(public_error)?;
    let basic = state
        .nexon
        .character_basic(key, &ocid, None)
        .await
        .map_err(public_error)?;
    credential_set(key).map_err(public_error)?;
    Ok(SetupResult {
        character_name: basic.character_name,
        world_name: basic.world_name,
        guild_name: basic
            .character_guild_name
            .unwrap_or_else(|| "길드 없음".into()),
    })
}

#[tauri::command]
pub fn get_dashboard(
    state: tauri::State<'_, AppState>,
    period: String,
) -> Result<DashboardData, String> {
    let connection = db::open(&state.db_path).map_err(public_error)?;
    db::dashboard(&connection, &period).map_err(public_error)
}

#[tauri::command]
pub fn set_favorite(
    state: tauri::State<'_, AppState>,
    character_id: i64,
    favorite: bool,
) -> Result<(), String> {
    let connection = db::open(&state.db_path).map_err(public_error)?;
    db::set_favorite(&connection, character_id, favorite).map_err(public_error)
}

#[tauri::command]
pub async fn add_external_favorite(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    character_name: String,
) -> Result<SetupResult, String> {
    let key = crate::credential_get().map_err(public_error)?;
    let name = character_name.trim();
    if name.is_empty() {
        return Err("추가할 캐릭터명을 입력해 주세요.".into());
    }
    let ocid = state.nexon.ocid(&key, name).await.map_err(public_error)?;
    let basic = state
        .nexon
        .character_basic(&key, &ocid, None)
        .await
        .map_err(public_error)?;
    let connection = db::open(&state.db_path).map_err(public_error)?;
    db::upsert_character(
        &connection,
        &basic.character_name,
        &basic.world_name,
        &basic.character_class,
        basic.character_image.as_deref(),
        &ocid,
        true,
    )
    .map_err(public_error)?;
    drop(connection);
    let _ = sync::sync_all(app, Some(30)).await.map_err(public_error)?;
    Ok(SetupResult {
        character_name: basic.character_name,
        world_name: basic.world_name,
        guild_name: basic
            .character_guild_name
            .unwrap_or_else(|| "길드 없음".into()),
    })
}

#[tauri::command]
pub fn show_dashboard(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("dashboard")
        .ok_or_else(|| "대시보드 창을 찾을 수 없습니다.".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_widget(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "위젯 창을 찾을 수 없습니다.".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_current_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_widget_opacity(window: tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::COLORREF,
            UI::WindowsAndMessaging::{
                GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, GWL_EXSTYLE, LWA_ALPHA,
                WS_EX_LAYERED,
            },
        };
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let alpha = (opacity.clamp(0.65, 1.0) * 255.0).round() as u8;
        unsafe {
            let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED.0 as i32);
            SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA)
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (window, opacity);
    Ok(())
}
