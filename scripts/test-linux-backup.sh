#!/usr/bin/env bash
# 임시 DB의 표본 기록을 백업한 뒤 별도 DB로 복원하여 무결성을 확인합니다.
set -euo pipefail
export PGHOST="${PGHOST:-/var/run/postgresql}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_db="maple_backup_test_$(date +%s)_$$"
restore_db="${source_db}_restore"
restore_created=0
createdb "$source_db"
cleanup() {
  dropdb "$source_db"
  if [ "$restore_created" -eq 1 ]; then dropdb "$restore_db"; fi
}
trap cleanup EXIT
psql --dbname="$source_db" --set=ON_ERROR_STOP=1 --command="CREATE TABLE backup_probe (name text, xp bigint); INSERT INTO backup_probe VALUES ('복원 검증', 123456789012345);" > /dev/null
archive="$(PGDATABASE="$source_db" bash "$script_dir/backup-linux.sh")"
if [ -n "${MAPLE_BACKUP_DIR:-}" ]; then
  test "$(dirname -- "$archive")" = "$MAPLE_BACKUP_DIR"
fi
test "$(stat -c %a "$archive")" = 600
bash "$script_dir/restore-linux.sh" "$archive" "$restore_db"
restore_created=1
if bash "$script_dir/restore-linux.sh" "$archive" "$restore_db"; then
  echo '기존 DB 복원을 거부하지 않았습니다.' >&2
  exit 1
fi
if bash "$script_dir/restore-linux.sh" /dev/null "$restore_db"; then
  echo '잘못된 백업을 거부하지 않았습니다.' >&2
  exit 1
fi
restored="$(psql --dbname="$restore_db" --tuples-only --no-align --command="SELECT name || ':' || xp FROM backup_probe")"
test "$restored" = '복원 검증:123456789012345'
printf '%s\n' '백업 파일 권한과 별도 DB 복원 검증 통과.'
