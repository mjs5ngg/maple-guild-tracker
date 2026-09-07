#!/usr/bin/env bash
# Ubuntu 개발 도구와 Windows 데이터와 분리된 PostgreSQL 개발 계정을 준비합니다.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "Run this setup as the WSL root user." >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y build-essential pkg-config libssl-dev curl ca-certificates git postgresql postgresql-contrib nodejs npm
if ! id mapledev >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash mapledev
fi
systemctl enable --now postgresql
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='mapledev'" | grep -q 1; then
  runuser -u postgres -- createuser --login --createdb mapledev
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='maple_exp'" | grep -q 1; then
  runuser -u postgres -- createdb --owner=mapledev maple_exp
fi
echo "Ubuntu dependencies and isolated development database are ready."
