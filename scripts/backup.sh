#!/usr/bin/env bash
# DBバックアップスクリプト
# 使い方: ./scripts/backup.sh [ラベル]
# 例:    ./scripts/backup.sh pre-migration
set -euo pipefail

LABEL=${1:-manual}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backup"
OUTPUT="${BACKUP_DIR}/${TIMESTAMP}_${LABEL}.sql"

mkdir -p "$BACKUP_DIR"

echo "バックアップ開始: $OUTPUT"
docker compose exec -T db pg_dump -U mysubchs mysubchs > "$OUTPUT"
echo "完了: $OUTPUT"
