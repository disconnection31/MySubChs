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

確認プロンプトが表示されるので `yes` を入力して実行する。

### リストア後の確認

Prismaのマイグレーション履歴テーブルも一緒に復元されるため、リストア後は以下で状態を確認する。

```bash
docker compose exec app npx prisma migrate status
```
