// Android 공개 화면의 직접 조회 결과를 네이티브 SQLite와 Keystore에 연결하는 JNI 진입점입니다.
use std::path::Path;

use jni::{
    objects::{JClass, JString},
    sys::{jboolean, jstring, JNI_FALSE, JNI_TRUE},
    JNIEnv,
};

use crate::direct_import::import;

#[no_mangle]
pub extern "system" fn Java_com_guildfollow_mobile_MainActivity_storeServiceKey(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jboolean {
    let value = match env.get_string(&value) {
        Ok(value) => String::from(value),
        Err(_) => return JNI_FALSE,
    };
    if !value.trim().is_empty() && value.len() <= 2048 && crate::credential_set(&value).is_ok() {
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_com_guildfollow_mobile_MainActivity_importDirectSnapshots(
    mut env: JNIEnv,
    _class: JClass,
    db_path: JString,
    payload: JString,
) -> jstring {
    let path = match env.get_string(&db_path) {
        Ok(value) => String::from(value),
        Err(_) => return std::ptr::null_mut(),
    };
    let payload = match env.get_string(&payload) {
        Ok(value) => String::from(value),
        Err(_) => return std::ptr::null_mut(),
    };
    // 실패 사유는 화면 조회를 막지 않되 logcat(RustStdoutStderr)에 남겨 원인을 추적할 수 있게 합니다.
    import(Path::new(&path), &payload)
        .map_err(|error| eprintln!("GuildWidget import failed: {error}"))
        .ok()
        .and_then(|snapshot| serde_json::to_string(&snapshot).ok())
        .and_then(|json| env.new_string(json).ok())
        .map(|value| value.into_raw())
        .unwrap_or_else(std::ptr::null_mut)
}
