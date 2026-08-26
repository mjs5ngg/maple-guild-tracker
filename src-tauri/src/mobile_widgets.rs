// Android 홈 위젯에 즐겨찾기 경험치 스냅샷을 전달합니다.
use serde::Serialize;
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

use crate::models::MobileWidgetSnapshot;

const PLUGIN_IDENTIFIER: &str = "com.mjs5ngg.guildmatefollow";

struct MobileWidgets<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct UpdateArgs {
    snapshot: MobileWidgetSnapshot,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile-widgets")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "WidgetSnapshotPlugin")?;
            app.manage(MobileWidgets(handle));
            Ok(())
        })
        .build()
}

pub fn update<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: MobileWidgetSnapshot,
) -> Result<(), String> {
    app.state::<MobileWidgets<R>>()
        .0
        .run_mobile_plugin("updateSnapshot", UpdateArgs { snapshot })
        .map_err(|error| error.to_string())
}
