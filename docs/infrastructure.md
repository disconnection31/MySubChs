# インフラ設計書 - MySubChs

> **スコープ**: Docker Compose 構成、環境変数、AWS 移行方針など、インフラストラクチャに関する設計を扱う。アプリケーションの技術設計は [architecture.md](./architecture.md)、DB スキーマは [database.md](./database.md) を参照。

## 1. Docker Compose 構成

以下は開発環境向けの `docker-compose.yml` テンプレートである。

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '3000:3000'
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    env_file:
      - .env
    command: npm run dev
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - mysubchs

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - .:/app
      - /app/node_modules
    env_file:
      - .env
    command: npx tsx src/jobs/worker.ts
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - mysubchs

  db:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-mysubchs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mysubchs}
      POSTGRES_DB: ${POSTGRES_DB:-mysubchs}
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-mysubchs}']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - mysubchs

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - mysubchs

volumes:
  postgres_data:
  redis_data:

networks:
  mysubchs:
    driver: bridge
```

### 補足

- ソースバインドマウント（`.:/app`）と匿名ボリューム（`/app/node_modules`、`/app/.next`）を併用することで、ホットリロードとホスト側 `node_modules` の混在防止を両立する。
- `db` / `redis` はヘルスチェックが成功するまで `app` / `worker` の起動を待機する（`depends_on` + `condition: service_healthy`）。
- `worker` は `app` と同一イメージを使用し、`command` のみ異なる（`npx tsx src/jobs/worker.ts`）。
- `db` の接続情報（ユーザー名・パスワード・DB名）は `.env` の `DATABASE_URL` と一致させる必要がある。

---

## 2. 環境変数

```env
# 認証
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# DB
DATABASE_URL=

# Redis
REDIS_URL=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=  # VAPID_PUBLIC_KEY と同じ値を設定する。Next.js の NEXT_PUBLIC_ プレフィックスによりブラウザ（フロントエンド）から参照可能になる。秘密情報ではないため公開して問題ない。
```

---

## 3. AWS 移行時の対応方針

| ローカル（Docker） | AWS |
|---|---|
| PostgreSQL コンテナ | RDS for PostgreSQL |
| Redis コンテナ | ElastiCache for Redis |
| Next.js コンテナ | ECS Fargate |
| BullMQ Worker コンテナ | ECS Fargate（別サービス） |
| - | ALB（Application Load Balancer） |
| - | Route 53 + ACM（独自ドメイン・HTTPS） |

Web Push通知の到達にはHTTPS必須のため、AWS移行時に自動対応される。

### ローカル開発での Web Push テスト

- **Chrome / Firefox**: `localhost` に対してHTTPのまま Web Push を許可する仕様のため、追加設定なしでローカル開発・テストが可能
- **Safari**: HTTPS必須。Safari でのテストが必要な場合は `mkcert` で自己署名証明書を発行し `https://localhost:3000` で起動する
