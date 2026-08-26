// 길드원 따라가기의 Tauri 런타임과 네이티브 서비스를 구성합니다.
mod commands;
mod db;
mod exp;
#[cfg(target_os = "android")]
mod mobile_widgets;
mod models;
mod nexon;
mod sync;

use std::path::PathBuf;

use tauri::Manager;
#[cfg(target_os = "windows")]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewUrl, WebviewWindowBuilder,
};
use thiserror::Error;

const CREDENTIAL_SERVICE: &str = "maple-guild-tracker";
const CREDENTIAL_ACCOUNT: &str = "nexon-open-api-key";

pub struct AppState {
    db_path: PathBuf,
    nexon: nexon::NexonClient,
    sync_lock: tokio::sync::Mutex<()>,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("데이터베이스 오류")]
    Database(#[from] rusqlite::Error),
    #[error("네트워크 오류")]
    Network(#[from] reqwest::Error),
    #[error("응답 해석 오류")]
    Json(#[from] serde_json::Error),
    #[error("날짜 해석 오류")]
    Date(#[from] chrono::ParseError),
    #[error("자격 증명 오류: {0}")]
    Credential(String),
    #[error("입력 오류: {0}")]
    Validation(String),
    #[error("API 오류 {code}: {message}")]
    Api {
        code: String,
        message: String,
        status: u16,
    },
    #[error("앱 초기화 오류: {0}")]
    Io(#[from] std::io::Error),
}

impl AppError {
    pub fn public_message(&self) -> String {
        match self {
            Self::Api { code, message, .. } => format!("NEXON API 오류 {code}. {message}"),
            Self::Credential(_) => {
                "운영체제 보안 저장소에서 API 키를 읽거나 저장하지 못했습니다.".into()
            }
            Self::Validation(message) => message.clone(),
            Self::Network(_) => "네트워크 연결을 확인한 뒤 다시 시도해 주세요.".into(),
            _ => self.to_string(),
        }
    }
}

#[cfg(target_os = "windows")]
fn credential_entry() -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|error| AppError::Credential(error.to_string()))
}

#[cfg(target_os = "android")]
fn credential_entry() -> Result<keyring_core::Entry, AppError> {
    use std::sync::OnceLock;

    static STORE: OnceLock<Result<(), String>> = OnceLock::new();
    let initialized = STORE.get_or_init(|| {
        let store =
            android_native_keyring_store::Store::new().map_err(|error| error.to_string())?;
        keyring_core::set_default_store(store);
        Ok(())
    });
    initialized
        .as_ref()
        .map_err(|error| AppError::Credential(error.clone()))?;
    keyring_core::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|error| AppError::Credential(error.to_string()))
}

pub fn credential_set(value: &str) -> Result<(), AppError> {
    credential_entry()?
        .set_password(value)
        .map_err(|error| AppError::Credential(error.to_string()))
}

pub fn credential_get() -> Result<String, AppError> {
    credential_entry()?
        .get_password()
        .map_err(|error| AppError::Credential(error.to_string()))
}

#[cfg(target_os = "windows")]
fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let dashboard = MenuItem::with_id(app, "dashboard", "대시보드 열기", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "미니 위젯 열기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&dashboard, &widget, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "dashboard" => {
                let _ = commands::show_dashboard(app.clone());
            }
            "widget" => {
                let _ = commands::show_widget(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = commands::show_dashboard(tray.app_handle().clone());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(mobile_widgets::init());
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--hidden"]),
    ));
    builder
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("tracker.sqlite3");
            let connection = db::open(&db_path)?;
            db::migrate(&connection)?;
            drop(connection);
            app.manage(AppState {
                db_path,
                nexon: nexon::NexonClient::new()?,
                sync_lock: tokio::sync::Mutex::new(()),
            });

            #[cfg(target_os = "windows")]
            {
                WebviewWindowBuilder::new(
                    app,
                    "widget",
                    WebviewUrl::App("index.html?view=widget".into()),
                )
                .title("길드원 따라가기 위젯")
                .inner_size(390.0, 480.0)
                .min_inner_size(320.0, 260.0)
                .always_on_top(true)
                .decorations(false)
                .skip_taskbar(true)
                .resizable(true)
                .visible(false)
                .build()?;
                create_tray(app)?;

                let arguments: Vec<String> = std::env::args().collect();
                if arguments.iter().any(|argument| argument == "--widget") {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.hide();
                    }
                    if let Some(window) = app.get_webview_window("widget") {
                        let _ = window.show();
                    }
                } else if arguments.iter().any(|argument| argument == "--hidden") {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.hide();
                    }
                }
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(sync::background_loop(handle));
            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "windows")]
            {
                if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                    api.prevent_close();
                    let _ = _window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::save_setup,
            commands::replace_api_key,
            commands::sync_now,
            commands::sync_live_now,
            commands::change_primary,
            commands::get_dashboard,
            commands::set_favorite,
            commands::add_external_favorite,
            commands::show_dashboard,
            commands::show_widget,
            commands::hide_current_window,
            commands::set_widget_opacity,
        ])
        .run(tauri::generate_context!())
        .expect("길드원 따라가기 실행에 실패했습니다.");
}
