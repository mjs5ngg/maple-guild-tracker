#!/usr/bin/env bash
# 검증된 백업을 새 PostgreSQL DB에만 복원하여 기존 데이터를 보호합니다.
set -euo pipefail
umask 077
if [ "$#" -ne 2 ]; then
  echo '사용법: restore-linux.sh 백업파일 새_DB명' >&2
  exit 1
fi
archive="$1"
target_db="$2"
if [[ ! "$target_db" =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
  echo '새 DB명은 소문자로 시작하는 영문 소문자·숫자·밑줄 1~63자로 지정하세요.' >&2
  exit 1
fi
if [ ! -f "$archive" ] || [[ "$archive" != *.dump ]]; then
  echo '완료된 .dump 백업 파일을 지정하세요.' >&2
  exit 1
fi
export PGHOST="${PGHOST:-/var/run/postgresql}"
pg_restore --list "$archive" > /dev/null
# 기존 DB가 있으면 createdb가 실패하므로 복원을 실행하지 않습니다.
createdb --template=template0 "$target_db"
if ! pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$target_db" "$archive"; then
  echo '복원 실패. 원본 백업과 새 DB를 보존했습니다. 기존 운영 DB는 변경하지 않았습니다.' >&2
  exit 1
fi
printf '%s\n' '새 DB 복원 완료. 운영 전환 전에 기록과 앱 동작을 검증하세요.'
