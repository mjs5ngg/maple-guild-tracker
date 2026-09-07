#!/usr/bin/env bash
# 로컬 PostgreSQL을 비공개 파일로 백업하고 아카이브 형식을 검증합니다.
set -euo pipefail
umask 077
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="$project_dir/.local-runtime/backups"
mkdir -p -- "$backup_dir"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGDATABASE="${PGDATABASE:-maple_exp}"
backup_file="$(mktemp "$backup_dir/maple-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump.partial")"
# 실패한 파일은 partial로 남기며 정상 백업으로 간주하지 않습니다.
pg_dump --format=custom --no-owner --no-acl --file="$backup_file"
pg_restore --list "$backup_file" > /dev/null
mv -- "$backup_file" "${backup_file%.partial}"
printf '%s\n' "${backup_file%.partial}"
