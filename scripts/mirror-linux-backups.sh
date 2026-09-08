#!/usr/bin/env bash
# 완료된 운영 백업을 별도 디스크에 복사하고 동일성을 검증합니다.
set -euo pipefail
umask 077
source_dir=/var/lib/maple-exp-backups
target_dir=/mnt/d/MapleEXPBackups
test -d "$target_dir"
shopt -s nullglob
archives=("$source_dir"/*.dump)
test "${#archives[@]}" -gt 0
for archive in "${archives[@]}"; do
  target="$target_dir/$(basename -- "$archive")"
  if [ ! -e "$target" ]; then
    temporary="$(mktemp "$target_dir/.copy-XXXXXX.partial")"
    trap 'rm -f -- "$temporary"' EXIT
    cp -- "$archive" "$temporary"
    cmp --silent "$archive" "$temporary"
    mv -n -- "$temporary" "$target"
    trap - EXIT
  fi
  cmp --silent "$archive" "$target"
done
printf '%s\n' '별도 디스크 백업 복사 및 동일성 검증 완료.'
