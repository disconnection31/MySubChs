# 運用手順書 - MySubChs

> **スコープ**: DBバックアップ・マイグレーションなど、日常的な運用作業の手順を扱う。インフラ設計（Docker構成・環境変数・AWS移行）は [infrastructure.md](./infrastructure.md) を参照。

## 1. DBバックアップ

### バックアップファイルの保存場所

`backup/` ディレクトリに保存される。このディレクトリは `.gitignore` で除外されているため Git には含まれない。

### バックアップの取り方

```bash
./scripts/backup.sh [ラベル]
```

| 引数 | 説明 |
|------|------|
| `ラベル` | ファイル名に付加する識別子（省略時は `manual`） |

**実行例**:

```bash
# マイグレーション前
./scripts/backup.sh pre-migration

# 任意のタイミングで手動バックアップ
./scripts/backup.sh
```

出力例: `backup/20260331_120000_pre-migration.sql`

> **Note**: バックアップには `DROP` 文が含まれる（`pg_dump --clean`）。既存データがある状態のDBへのリストアも安全に上書きできる。

---

## 2. DBマイグレーション手順

スキーマを変更する際は、必ず事前にバックアップを取ること。

### 手順

**ステップ 1: バックアップを取る**

```bash
./scripts/backup.sh pre-migration
```

**ステップ 2: マイグレーションを実行する**

```bash
docker compose exec app npx prisma migrate dev --name <マイグレーション名>
```

**ステップ 3: 状態を確認する**

```bash
docker compose exec app npx prisma migrate status
```

---

## 3. ロールバック手順

マイグレーション後に問題が発生した場合は、事前に取ったバックアップからリストアする。

### リストアの実行

```bash
./scripts/restore.sh backup/<ファイル名>
```

**実行例**:

```bash
./scripts/restore.sh backup/20260331_120000_pre-migration.sql
```

確認プロンプトが表示されるので `yes` を入力して実行する。リストアは単一トランザクションで実行されるため、途中でエラーが発生した場合は自動的にロールバックされる。

### リストア後の確認

Prismaのマイグレーション履歴テーブルも一緒に復元されるため、リストア後は以下で状態を確認する。

```bash
docker compose exec app npx prisma migrate status
```

---

## 4. Redis マイグレーション（repeatableジョブの旧形式削除）

### 背景

BullMQ の repeatable ジョブ名（例: `auto-poll-{categoryId}`, `content-cleanup` など）をコード変更で改名・削除した場合、Redis 上には旧形式のジョブが残留することがある。これを放置すると、旧ジョブが発火し続け、ポーリングが二重実行されたり、未定義ジョブ名として警告ログが出続ける。

### 対処方法

Worker 起動時に `reconcileRepeatableJobs()` が自動的に以下を実行する（Issue #157）。

- 既知のジョブ名パターン（`auto-poll-*` / `content-cleanup` / `watchlater-cleanup` / `setup` / `setup-*`）に一致しない repeatable ジョブを孤児として削除する。
- DBに対応するカテゴリが存在しない `auto-poll-*` ジョブも従来通り削除する。

したがって、ジョブ名変更を含むデプロイでは **Worker コンテナを再起動するだけで旧形式は自動削除される**。

```bash
docker compose restart worker
```

### 確認方法

再起動後、Worker のログに以下の行が出ていれば旧形式ジョブが削除されている。

```
[worker] Removed unknown orphan job <削除されたジョブ名>
```

ログが1件も出ていなければ、孤児ジョブは存在しなかったということ（正常）。

### 手動確認コマンド

Redis に残っている repeatable ジョブを直接確認したい場合は、以下のコマンドで一覧できる。

```bash
# repeatable ジョブのキー一覧
docker compose exec redis redis-cli --scan --pattern 'bull:mysubchs:repeat:*'

# 個別キーの中身を確認
docker compose exec redis redis-cli HGETALL 'bull:mysubchs:repeat:<key>'
```

> **Note**: BullMQ の内部キー形式は将来のバージョンアップで変わる可能性がある。本手順は確認のための参考情報であり、手動削除よりも Worker の自動再同期に任せることを推奨する。
