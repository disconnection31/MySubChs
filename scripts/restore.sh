#!/usr/bin/env bash
# DBリストアスクリプト
# 使い方: ./scripts/restore.sh <バックアップファイル>
# 例:    ./scripts/restore.sh backup/20260331_120000_pre-migration.sql
set -euo pipefail

BACKUP_FILE=${1:?"バックアップファイルを指定してください (例: backup/20260331_120000_pre-migration.sql)"}
POSTGRES_USER="${POSTGRES_USER:-mysubchs}"
POSTGRES_DB="${POSTGRES_DB:-mysubchs}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "エラー: ファイルが見つかりません: $BACKUP_FILE" >&2
  exit 1
fi

echo "警告: 現在のDBを上書きします。よろしいですか？ (yes/no)"
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "中止しました"
  exit 0
fi

echo "リストア開始: $BACKUP_FILE"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_FILE"
echo "完了。マイグレーション状態を確認してください: npx prisma migrate status"
