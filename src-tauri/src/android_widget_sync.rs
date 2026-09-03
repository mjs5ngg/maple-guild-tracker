// Android WorkManager가 Rust 데이터 계층으로 위젯 동기화를 요청하는 JNI 진입점을 제공합니다.
use std::{path::Path, ptr::null_mut};

use jni::{
    objects::{JClass, JString},
    sys::jstring,
    JNIEnv,
};

#[no_mangle]
pub extern "system" fn Java_com_mjs5ngg_guildmatefollow_WidgetSyncWorker_syncAndBuildSnapshot(
    mut env: JNIEnv,
    _class: JClass,
    db_path: JString,
) -> jstring {
    let path = match env.get_string(&db_path) {
        Ok(value) => String::from(value),
        Err(_) => return null_mut(),
    };
    let result = std::panic::catch_unwind(|| {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .ok()?;
        let snapshot = runtime
            .block_on(crate::sync::sync_mobile_widget(Path::new(&path)))
            .ok()?;
        serde_json::to_string(&snapshot).ok()
    })
    .ok()
    .flatten();
    result
        .and_then(|json| env.new_string(json).ok())
        .map(|value| value.into_raw())
        .unwrap_or_else(null_mut)
}
