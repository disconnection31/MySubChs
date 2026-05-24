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

---

## 5. 依存パッケージ追加後の起動

### 採用方針

`app` / `worker` サービスの `command` 先頭で毎回 `npm install` を実行する（Issue #172）。これにより、`package.json` / `package-lock.json` に追加された依存が、起動時にコンテナ内の匿名ボリューム上 `node_modules` へ自動的に同期される。

```yaml
app:
  command: sh -c "npm install && npx prisma generate && npm run dev"
worker:
  command: sh -c "npm install && npx prisma generate && npx tsx src/jobs/worker.ts"
```

### 利用者の操作

依存パッケージ追加を含む変更を pull した後は、特別な手順なしで以下を実行するだけで反映される。

```bash
docker compose up
```

- lockfile が既にコンテナ内 `node_modules` と一致している場合、`npm install` の追加処理は数秒で完了する。
- lockfile に差分がある場合は差分のみが導入される（`node_modules` の全削除→再構築は発生しない）。依存数や差分規模に応じて数十秒〜分単位かかることがある。
- 起動時に `npm install` が走るため、起動毎に npm registry への到達性が必要。オフライン環境ではコンテナが起動失敗する。

> **Note**: `docker-compose.yml` は `- .:/app` でホストのソースをバインドマウントしているため、コンテナ内で実行された `npm install` がホスト側の `package-lock.json` を書き換える場合がある。ブランチ切替直後や transitive な依存解決順序の揺れが原因で、依存追加が同期された証跡として git status に差分が出ることがある（想定挙動）。

### 背景

`docker-compose.yml` では `node_modules` を匿名ボリュームに分離している（ホスト側 Windows の `node_modules` がコンテナへ混入してネイティブモジュールが衝突するのを防ぐため）。`Dockerfile` の `npm ci` はイメージビルド時のみ実行されるため、既存コンテナを `docker compose up` で再起動しただけでは新規依存が反映されず、Next.js が `Module not found` で 500 を返す事象が発生していた。`command` 先頭での `npm install` 実行により、この問題を恒久的に解消する。

### 例外的な復旧手順（参考情報）

匿名ボリューム上の `node_modules` が壊れた場合（インストールが途中で中断された、ファイルシステムが破損した等）の作り直し手順。通常は不要。

**ステップ 1: コンテナを停止する**

```bash
docker compose down
```

> **警告**: `docker compose down -v` は実行しないこと。`-v` フラグは `postgres_data` / `redis_data` を含む **すべての** ボリュームを削除するため、DB と Redis のデータが失われる。

**ステップ 2: 該当の匿名ボリュームを確認する**

```bash
docker volume ls
```

匿名ボリュームはランダムなハッシュ名で表示される（例: `mysubchs_<ハッシュ>`）。`app` / `worker` の `/app/node_modules` および `app` の `/app/.next` に対応するものを特定する。判別が難しい場合は `docker volume inspect <名前>` でマウント先を確認する。

**ステップ 3: 該当ボリュームのみを削除する**

```bash
docker volume rm <ボリューム名>
```

`postgres_data` / `redis_data` は削除しないこと。

**ステップ 4: 再起動する**

```bash
docker compose up
```

`command` 先頭の `npm install` がクリーンな匿名ボリュームに対して依存をインストールし、`node_modules` が再構築される。
