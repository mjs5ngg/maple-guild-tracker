// 승인된 Windows 앱 키를 파일에 복사하지 않고 서버 메모리에서 읽습니다.
pub fn load() -> Option<String> {
    if let Ok(key) = std::env::var("NEXON_OPERATOR_KEY") {
        if !key.trim().is_empty() {
            return Some(key);
        }
    }
    if std::env::var("NEXON_USE_WINDOWS_CREDENTIAL").as_deref() != Ok("1") {
        return None;
    }
    #[cfg(windows)]
    {
        let result = keyring::Entry::new("maple-guild-tracker", "nexon-open-api-key")
            .and_then(|entry| entry.get_password());
        match result {
            Ok(key) if !key.trim().is_empty() => return Some(key),
            _ => eprintln!("Windows 앱 키를 읽지 못했습니다. 자격 증명 저장 상태를 확인하세요."),
        }
    }
    #[cfg(not(windows))]
    eprintln!("Windows 자격 증명은 Windows에서만 읽을 수 있습니다.");
    None
}
