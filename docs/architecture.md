# 技術設計書 - MySubChs

> **スコープ**: アプリケーションの技術スタック、システム構成、ディレクトリ構造、プラットフォームアダプターパターン、カーソルページネーション設計を扱う。認証・チャンネル同期は [integrations/youtube-auth.md](./integrations/youtube-auth.md)、ポーリング設計は [integrations/youtube-polling.md](./integrations/youtube-polling.md) を参照。

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [integrations/youtube-auth.md](./integrations/youtube-auth.md) | Google OAuth 認証フロー、チャンネル同期、Worker トークン管理 |
| [integrations/youtube-polling.md](./integrations/youtube-polling.md) | BullMQ ポーリング設計、クォータ管理、エラー処理 |
| [database.md](./database.md) | DB スキーマ定義、Prisma モデル |
| [openapi.yaml](./openapi.yaml) | REST API 仕様（エンドポイント・リクエスト/レスポンス形式） |
| [error-handling.md](./error-handling.md) | API エラーレスポンス形式、エラーコード一覧、ロギング方針 |
| [infrastructure.md](./infrastructure.md) | Docker Compose、環境変数、AWS 移行 |
| [ui/common.md](./ui/common.md) | フロントエンド共通仕様（エラーUI、楽観的更新） |
| [ui/dashboard.md](./ui/dashboard.md) | ダッシュボード UI 仕様 |
| [ui/channels.md](./ui/channels.md) | チャンネル管理画面 UI 仕様 |
| [ui/categories.md](./ui/categories.md) | カテゴリ管理画面 UI 仕様 |
| [ui/settings.md](./ui/settings.md) | 設定画面 UI 仕様 |
| [ui/login.md](./ui/login.md) | ログイン画面 UI 仕様 |
| [ui/pwa.md](./ui/pwa.md) | PWA・Service Worker 仕様 |

---

## 1. 技術スタック

### フロントエンド
| 項目 | 採用技術 | 理由 |
|---|---|---|
| フレームワーク | Next.js 14 (App Router) | フロント・APIを1プロジェクトで管理、VibeCodingとの親和性が高い |
| 言語 | TypeScript | 型安全性、AIコード生成の精度向上 |
| スタイリング | Tailwind CSS | レスポンシブ対応が容易、クラスベースで可読性が高い |
| UIコンポーネント | shadcn/ui | 高品質なコンポーネント群、カスタマイズ性が高い |
| 状態管理 | React Query (TanStack Query) | サーバー状態管理、キャッシュ・再取得が容易 |

### バックエンド
| 項目 | 採用技術 | 理由 |
|---|---|---|
| APIサーバー | Next.js API Routes | フロントと同一プロジェクト、初期構成のシンプルさ |
| 認証 | NextAuth.js (Auth.js) | Google OAuth対応、セッション管理が簡単 |
| ORM | Prisma | TypeScript型安全、マイグレーション管理が容易 |
| バックグラウンドジョブ | BullMQ | ポーリングジョブのキュー管理、リトライ制御 |

### データストア
| 項目 | 採用技術 | 理由 |
|---|---|---|
| RDB | PostgreSQL 16 | リレーショナルデータに最適、AWS RDS互換 |
| キャッシュ/キュー | Redis 7 | BullMQのバックエンド、AWS ElastiCache互換 |

### インフラ
| 項目 | 採用技術 | 理由 |
|---|---|---|
| コンテナ | Docker + Docker Compose | ローカル環境の統一、AWS移行時の可搬性 |
| PWA | next-pwa | Web Push通知、ホーム画面追加対応 |

### バックエンド設計方針

#### 外部依存値の管理
外部サービスの仕様に由来する数値（API クォータ上限、レート制限、しきい値など）はコード中にハードコードしない。専用の設定ファイル（`src/lib/config.ts` 等）に名前付き定数として定義し、一箇所で管理する。

- 例: YouTube API の1日あたりクォータ上限 `10,000` → `YOUTUBE_QUOTA_DAILY_LIMIT`
- 例: クォータ警告しきい値 `9,000` → `YOUTUBE_QUOTA_WARNING_THRESHOLD`

フロントエンドが外部依存値を必要とする場合は、バックエンドの API レスポンスを通じて渡す（フロントエンドに直接ハードコードしない）。

---

## 2. システム構成図

```
[ブラウザ / スマホ]
       │
       ▼
┌─────────────────────────┐
│    Next.js App          │
│  ┌─────────────────┐    │
│  │  Pages / UI     │    │
│  └────────┬────────┘    │
│           │             │
│  ┌────────▼────────┐    │
│  │  API Routes     │    │
│  │  - /auth/*      │    │
│  │  - /api/...     │    │
│  └────────┬────────┘    │
└───────────┼─────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌─────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │
│  (DB)   │  │ (Queue)  │
└─────────┘  └────┬─────┘
                  │
             ┌────▼──────┐
             │  BullMQ   │
             │  Worker   │
             │(Polling)  │
             └────┬──────┘
                  │
             ┌────▼──────┐
             │ YouTube   │
             │ Data API  │
             └───────────┘
```

---

## 3. ディレクトリ構成

```
MySubChs/
├── docs/                      # 仕様ドキュメント
│   ├── requirements.md
│   ├── architecture.md
│   ├── database.md
│   ├── infrastructure.md
│   ├── error-handling.md
│   ├── openapi.yaml
│   ├── integrations/
│   │   ├── youtube-auth.md
│   │   └── youtube-polling.md
│   └── ui/
│       ├── common.md
│       ├── dashboard.md
│       ├── channels.md
│       ├── categories.md
│       ├── settings.md
│       ├── login.md
│       └── pwa.md
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx       # メイン画面
│   │   │   ├── channels/
│   │   │   ├── categories/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── auth/          # NextAuth
│   │       ├── channels/
│   │       ├── categories/
│   │       │   └── [id]/
│   │       │       └── poll/  # POST: カテゴリ手動ポーリング
│   │       ├── contents/
│   │       ├── watch-later/
│   │       └── notifications/
│   ├── components/
│   │   ├── ui/                # shadcn/ui コンポーネント
│   │   ├── layout/
│   │   └── features/          # 機能別コンポーネント
│   ├── lib/
│   │   ├── auth.ts            # NextAuth設定
│   │   ├── db.ts              # Prismaクライアント
│   │   ├── redis.ts           # Redisクライアント
│   │   └── platforms/         # プラットフォームアダプター
│   │       ├── base.ts        # 抽象インターフェース
│   │       └── youtube.ts     # YouTube実装
│   ├── jobs/
│   │   ├── polling.ts             # BullMQポーリングジョブ（Watch Later自動付与ロジック含む）
│   │   ├── watchLaterCleanup.ts   # 期限切れWatchLaterレコードの定期削除
│   │   └── contentCleanup.ts      # 保持期間超過Contentの物理削除
│   └── types/
├── prisma/
│   └── schema.prisma
├── public/
├── worker/
│   └── index.js               # Service Worker カスタムロジック (next-pwa がバンドルして public/ に出力)
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## 4. プラットフォームアダプターパターン

将来の他プラットフォーム対応に備え、チャンネル・コンテンツ取得ロジックをインターフェースで抽象化する。

```typescript
// src/lib/platforms/base.ts
interface PlatformAdapter {
  getSubscribedChannels(accessToken: string): Promise<Channel[]>
  getRecentContents(channelId: string): Promise<Content[]>
  getLiveStatus(channelId: string): Promise<LiveStatus>
}

// プラットフォーム識別子
type Platform = 'youtube' | 'twitch' // 将来追加
```

---

## 5. カーソルページネーション設計

`GET /contents` のページネーションにはキーセットページネーション（Keyset Pagination）を採用する。

### 採用方式

オフセットベースではなくキーセット方式を採用する。

**理由：**
- 無限スクロール中にデータ追加・削除が発生しても重複・欠損が起きない
- `contentAt` に INDEX があれば大量データでも安定したパフォーマンスを維持できる

### カーソルのフォーマット

```json
{ "contentAt": "<ISO8601文字列>", "id": "<string>" }
```

上記オブジェクトをJSONシリアライズしてBase64エンコードしたものをカーソルとして使用する（クライアントから見ると不透明なトークン）。

`contentAt` は複数レコードで同値になりうるため、タイブレーカーとして `id` を含める。

### 取得条件

```
-- 降順（新しい順）
WHERE (contentAt, id) < (cursor.contentAt, cursor.id)
ORDER BY contentAt DESC, id DESC

-- 昇順（古い順）
WHERE (contentAt, id) > (cursor.contentAt, cursor.id)
ORDER BY contentAt ASC, id ASC
```

### ソート方向切替時の挙動

ソート方向（昇順/降順）を切り替えるとカーソルは無効になる。フロントエンドはソート切替時にカーソルをリセットして先頭から再取得する。

---

## 6. UIプレビューモード

YouTube API や Google OAuth なしに画面の見栄え・使い勝手を確認するための開発環境専用モード。

### 有効化

`.env` に `DEV_BYPASS_AUTH=true` を設定する。`NODE_ENV=production` では自動的に無効化される（二重ガード）。

```bash
# Worker不要、app + db + redis のみ起動
docker compose up app db redis

# シードデータ投入
docker compose exec app npx prisma db seed
```

### 認証バイパス

`isDevBypassAuth()`（`src/lib/config.ts`）が `true` を返す場合:

- **middleware**: `getToken()` をスキップし全ページにアクセス可能。`/login` は `/` にリダイレクト
- **API Routes**: `getAuthenticatedSession()` が固定の dev ユーザーセッションを返す

### dev ユーザー

| 項目 | 値 |
|---|---|
| ID | `00000000-0000-4000-a000-000000000001` |
| Name | `Dev User` |
| Email | `dev@example.com` |
| Image | `/images/placeholder-avatar.svg` |

### シードデータ（`prisma/seed.ts`）

| データ | 件数 | 備考 |
|---|---|---|
| User | 1 | 固定UUID の dev ユーザー |
| Account | 1 | ダミー Google Account |
| UserSetting | 1 | デフォルト値 |
| Category | 5 | ゲーム、音楽、技術、料理、エンタメ |
| NotificationSetting | 5 | カテゴリごとに1件（一部カスタム設定あり） |
| Channel | 22 | 各カテゴリに3〜4件 + 未分類3件 |
| Content | 51 | VIDEO/LIVE混在、全ステータス（UPCOMING/LIVE/ARCHIVED/CANCELLED） |
| WatchLater | 5 | MANUAL/AUTO混在、手動削除済みレコード含む |

全レコードは固定UUIDを使用し `upsert` で投入されるため、繰り返し実行しても安全（冪等）。日時は 2026-03-15 基準の固定値。
