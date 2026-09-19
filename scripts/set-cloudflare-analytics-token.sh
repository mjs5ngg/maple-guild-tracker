#!/usr/bin/env bash
# 표준 입력으로 받은 Cloudflare 분석 토큰을 운영 설정 파일에 저장하고 관리자 대시보드를 다시 시작합니다(root로 실행).
set -euo pipefail
env_file="${1:-/etc/maple-exp/server.env}"
account_id="57687045cd680ec85633e84d8574b413"
# Windows PowerShell은 파이프로 넘길 때 앞에 UTF-8 BOM, 끝에 CRLF를 붙이므로 둘 다 제거합니다.
token="$(tr -d '\r\n')"
token="${token#$'\xEF\xBB\xBF'}"
if [[ ! "$token" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "토큰 형식이 올바르지 않습니다." >&2
  exit 2
fi
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
if [[ -f "$env_file" ]]; then
  grep -v -E '^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_ANALYTICS_TOKEN)=' "$env_file" > "$tmp" || true
fi
printf 'CLOUDFLARE_ACCOUNT_ID=%s\nCLOUDFLARE_ANALYTICS_TOKEN=%s\n' "$account_id" "$token" >> "$tmp"
install -m 0600 -o root -g root "$tmp" "$env_file"
if [[ "${2:-restart}" == "restart" ]]; then
  systemctl restart maple-exp-operations.service
fi
