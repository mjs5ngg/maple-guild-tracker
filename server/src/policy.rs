// 활성 사용자와 캐릭터 구독의 합집합을 계산합니다.
use chrono::{DateTime, Duration, Utc};
use std::collections::{BTreeSet, HashMap};

pub const INTERVAL_SECONDS: u64 = 900;
pub const FAVORITE_LIMIT: usize = 30;

pub fn active(last: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    last > now - Duration::hours(168)
}

pub fn targets(
    users: &[(DateTime<Utc>, String, Vec<String>)],
    guild_of: &HashMap<String, String>,
    members: &HashMap<String, Vec<String>>,
    now: DateTime<Utc>,
) -> BTreeSet<String> {
    let mut result = BTreeSet::new();
    for (last, primary, favorites) in users {
        if !active(*last, now) {
            continue;
        }
        if !primary.is_empty() {
            result.insert(primary.clone());
            if let Some(names) = guild_of.get(primary).and_then(|g| members.get(g)) {
                result.extend(names.iter().cloned());
            }
        }
        result.extend(favorites.iter().cloned());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_guild_and_favorites_survive_one_inactive_user() {
        let now = Utc::now();
        let users = vec![
            (now - Duration::hours(168), "A".into(), vec!["외부".into()]),
            (now, "B".into(), vec!["외부".into()]),
        ];
        let guilds = HashMap::from([("A".into(), "G".into()), ("B".into(), "G".into())]);
        let members = HashMap::from([("G".into(), vec!["A".into(), "B".into(), "C".into()])]);
        assert_eq!(targets(&users, &guilds, &members, now).len(), 4);
        assert!(targets(&users[..1], &guilds, &members, now).is_empty());
    }
    #[test]
    fn exact_168_hours_is_inactive() {
        let now = Utc::now();
        assert!(!active(now - Duration::hours(168), now));
        assert!(active(
            now - Duration::hours(168) + Duration::seconds(1),
            now
        ));
    }
}
