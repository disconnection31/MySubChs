#!/usr/bin/env bash
# DBバックアップスクリプト
# 使い方: ./scripts/backup.sh [ラベル]
# 例:    ./scripts/backup.sh pre-migration
set -euo pipefail

LABEL=${1:-manual}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backup"
OUTPUT="${BACKUP_DIR}/${TIMESTAMP}_${LABEL}.sql"
POSTGRES_USER="${POSTGRES_USER:-mysubchs}"
POSTGRES_DB="${POSTGRES_DB:-mysubchs}"

mkdir -p "$BACKUP_DIR"

TEMP_OUTPUT=$(mktemp)
trap "rm -f '$TEMP_OUTPUT'" EXIT

echo "バックアップ開始: $OUTPUT"
docker compose exec -T db pg_dump --clean -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TEMP_OUTPUT"
mv "$TEMP_OUTPUT" "$OUTPUT"
echo "完了: $OUTPUT"
