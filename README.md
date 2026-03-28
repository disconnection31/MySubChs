# MySubChs

YouTubeの登録チャンネルをカスタムカテゴリで整理し、新着動画・ライブ配信を追跡するWebアプリ。

## 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) がインストール・起動済みであること

## セットアップ

### 共通手順

```bash
# 1. .env ファイルを作成
cp .env.example .env

# 2. NEXTAUTH_SECRET を生成して .env に設定
openssl rand -base64 32
# 出力値を .env の NEXTAUTH_SECRET= に貼り付ける
```

### A. UIプレビューモード（動作確認用）

Google OAuth不要。シードデータで画面の見た目・操作感を確認できる。

`.env` を以下のように設定：

```
DEV_BYPASS_AUTH=true
GOOGLE_CLIENT_ID=dummy
GOOGLE_CLIENT_SECRET=dummy
```

```bash
# 起動（Worker不要、app + db + redis のみ）
docker compose up --build -d app db redis

# DBマイグレーション
docker compose exec app npx prisma migrate deploy

# シードデータ投入
docker compose exec app npx prisma db seed

# ブラウザで http://localhost:3000 にアクセス
```

### B. フル機能モード（YouTube連携あり）

YouTube APIとの連携を含む全機能を利用する場合。

1. [Google Cloud Console](https://console.cloud.google.com/) でOAuth 2.0クライアントを作成
   - 承認済みリダイレクトURI: `http://localhost:3000/api/auth/callback/google`
   - スコープ: `youtube.readonly`
2. `.env` に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を設定

```bash
# 起動
docker compose up --build -d

# DBマイグレーション
docker compose exec app npx prisma migrate deploy

# ブラウザで http://localhost:3000 にアクセス → Googleログイン
```

## 停止・リセット

```bash
# 停止
docker compose down

# 停止 + データ完全削除（DB・Redisのボリュームも削除）
docker compose down -v
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 機能・非機能要件 |
| [docs/architecture.md](docs/architecture.md) | システム構成、技術スタック |
| [docs/database.md](docs/database.md) | DBスキーマ、設計判断 |
| [docs/openapi.yaml](docs/openapi.yaml) | REST API仕様 (OpenAPI 3.1) |
| [docs/infrastructure.md](docs/infrastructure.md) | Docker Compose、環境変数、AWS移行 |
| [docs/ui/](docs/ui/) | 画面別UI仕様 |
