#!/usr/bin/env bash
# 오래된 15분 관측 원본을 날짜별로 압축 검증한 뒤 PostgreSQL에서 정리합니다.
set -euo pipefail

umask 077
archive_dir="${MAPLE_OBSERVATION_ARCHIVE_DIR:-/var/lib/maple-exp-observation-archive}"
retention_days="${MAPLE_OBSERVATION_ARCHIVE_DAYS:-90}"
dry_run="${MAPLE_RETENTION_DRY_RUN:-0}"

if [[ "$archive_dir" != /* || "$archive_dir" == "/" ]]; then
  printf '안전하지 않은 아카이브 경로를 거부합니다.\n' >&2
  exit 2
fi
if [[ ! "$retention_days" =~ ^[0-9]+$ ]] || (( retention_days < 1 )); then
  printf '보존 일수는 1 이상의 정수여야 합니다.\n' >&2
  exit 2
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  printf 'DATABASE_URL이 필요합니다.\n' >&2
  exit 2
fi

mkdir -p -- "$archive_dir"
exec 9>"$archive_dir/.retention.lock"
flock -n 9 || exit 0

mapfile -t archive_dates < <(
  psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -Atc \
    "SELECT (observed_at AT TIME ZONE 'Asia/Seoul')::date
       FROM observations
      GROUP BY 1
     HAVING max(observed_at) < now() - interval '48 hours'
      ORDER BY 1"
)

if [[ "$dry_run" == "1" ]]; then
  printf '%s\n' "${archive_dates[@]}"
  exit 0
fi

for archive_date in "${archive_dates[@]}"; do
  if [[ ! "$archive_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    printf '잘못된 날짜 값을 거부합니다. %s\n' "$archive_date" >&2
    exit 3
  fi

  archive_file="$archive_dir/observations-$archive_date.ndjson.gz"
  partial_file="$archive_file.partial"
  source_count="$(psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -At -c \
    "SELECT count(*) FROM observations
      WHERE (observed_at AT TIME ZONE 'Asia/Seoul')::date = DATE '$archive_date'")"

  if [[ ! -f "$archive_file" ]]; then
    psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -At -c \
      "SELECT jsonb_build_object(
          'ocid', ocid,
          'observedAt', observed_at,
          'basic', basic
        )::text
         FROM observations
        WHERE (observed_at AT TIME ZONE 'Asia/Seoul')::date = DATE '$archive_date'
        ORDER BY observed_at, ocid" \
      | gzip -9 > "$partial_file"
    gzip -t -- "$partial_file"
    archived_count="$(gzip -cd -- "$partial_file" | wc -l)"
    if [[ "$archived_count" != "$source_count" ]]; then
      printf '아카이브 건수 불일치. date=%s source=%s archive=%s\n' \
        "$archive_date" "$source_count" "$archived_count" >&2
      exit 4
    fi
    mv -- "$partial_file" "$archive_file"
  else
    gzip -t -- "$archive_file"
    archived_count="$(gzip -cd -- "$archive_file" | wc -l)"
    if [[ "$archived_count" != "$source_count" ]]; then
      printf '기존 아카이브 건수 불일치. date=%s source=%s archive=%s\n' \
        "$archive_date" "$source_count" "$archived_count" >&2
      exit 4
    fi
  fi

  deleted_count="$(psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 -At -c \
    "WITH deleted AS (
       DELETE FROM observations
        WHERE (observed_at AT TIME ZONE 'Asia/Seoul')::date = DATE '$archive_date'
       RETURNING 1
     ) SELECT count(*) FROM deleted")"
  if [[ "$deleted_count" != "$source_count" ]]; then
    printf '원본 정리 건수 불일치. date=%s source=%s deleted=%s\n' \
      "$archive_date" "$source_count" "$deleted_count" >&2
    exit 5
  fi
  printf '관측 원본 보존 완료. date=%s rows=%s\n' "$archive_date" "$deleted_count"
done

find "$archive_dir" -maxdepth 1 -type f -name 'observations-*.ndjson.gz' \
  -mtime "+$retention_days" -print -delete
