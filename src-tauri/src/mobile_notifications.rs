// Android 알림 환경 상태와 시스템 설정 동작을 네이티브 플러그인에 연결합니다.
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

use crate::models::MobileNotificationStatus;

const PLUGIN_IDENTIFIER: &str = "com.mjs5ngg.guildmatefollow";

struct MobileNotifications<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile-notifications")
        .setup(|app, api| {
            let handle = api.register_android_plugin(
                PLUGIN_IDENTIFIER,
                "NotificationStatusPlugin",
            )?;
            app.manage(MobileNotifications(handle));
            Ok(())
        })
        .build()
}

pub fn get_status<R: Runtime>(app: &AppHandle<R>) -> Result<MobileNotificationStatus, String> {
    app.state::<MobileNotifications<R>>()
        .0
        .run_mobile_plugin("getStatus", ())
        .map_err(|error| error.to_string())
}

pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.state::<MobileNotifications<R>>()
        .0
        .run_mobile_plugin("openSettings", ())
        .map_err(|error| error.to_string())
}

pub fn open_background_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.state::<MobileNotifications<R>>()
        .0
        .run_mobile_plugin("openBackgroundSettings", ())
        .map_err(|error| error.to_string())
}

pub fn retry<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.state::<MobileNotifications<R>>()
        .0
        .run_mobile_plugin("retry", ())
        .map_err(|error| error.to_string())
}
