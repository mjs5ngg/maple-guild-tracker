#!/usr/bin/env bash
# 별도 systemd 시험 서비스의 권한 제한과 장애 후 자동 재시작을 검증합니다.
set -euo pipefail
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 1 ]; then
  echo 'root로 실행하고 검증용 DATABASE_URL을 인수로 지정하세요. 비밀번호 없는 Unix 소켓만 사용하세요.' >&2
  exit 1
fi
unit=maple-exp-rehearsal
if systemctl cat "$unit" >/dev/null 2>&1; then
  echo '동일 이름 서비스가 존재하므로 실행하지 않습니다.' >&2
  exit 1
fi
systemd-run --unit="$unit" --collect \
  --property=User=mapledev --property=Group=mapledev \
  --property=WorkingDirectory=/home/mapledev/maple-guild-tracker \
  --property=Restart=on-failure --property=RestartSec=10 \
  --property=UMask=0077 --property=NoNewPrivileges=true \
  --property=PrivateTmp=true --property=ProtectSystem=strict \
  --property=ProtectHome=read-only --property=RestrictSUIDSGID=true \
  --setenv=SERVER_PORT=3200 --setenv=DIRECT_PORT=3201 \
  --setenv=PUBLIC_ORIGIN=http://127.0.0.1:3200 \
  --setenv="DATABASE_URL=$1" \
  /home/mapledev/maple-guild-tracker/server/target/debug/maple-exp-server
trap 'systemctl stop "$unit"' EXIT
wait_ready() {
  for attempt in $(seq 1 25); do
    if curl --fail --silent http://127.0.0.1:3200/api/status | grep -q '"database":true'; then
      return 0
    fi
    sleep 1
  done
  return 1
}
wait_ready
before="$(systemctl show "$unit" --property=MainPID --value)"
systemctl kill --signal=SIGKILL --kill-whom=main "$unit"
sleep 1
wait_ready
after="$(systemctl show "$unit" --property=MainPID --value)"
test "$before" != "$after"
test "$(systemctl show "$unit" --property=NRestarts --value)" -ge 1
curl --fail --silent http://127.0.0.1:3200/api/status
printf '\n%s\n' 'systemd 장애 후 새 프로세스 재시작과 DB 연결 복구 검증 통과.'
