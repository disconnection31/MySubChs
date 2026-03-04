# 技術設計書 - MySubChs

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
│   └── database.md
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
│   └── sw.js                  # Service Worker (PWA)
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

## 5. 認証フロー

```
1. ユーザーが「Googleでログイン」ボタンをクリック
2. NextAuth → Google OAuth 2.0 認証
3. コールバック：アクセストークン・リフレッシュトークンをDBに保存
4. セッション確立（JWT or DB Session）
5. 以降のAPI呼び出しはセッションで認証
6. アクセストークン期限切れ時はリフレッシュトークンで自動更新
```

### 初回ログイン時の即時ポーリング

初回ログイン時（`UserSetting` が存在しない場合が「初回」の判断基準）に、NextAuthのsignInコールバックからBullMQジョブを即時エンキューする。

```
初回ログイン判定フロー:
1. NextAuth signIn コールバックが呼ばれる
2. UserSetting.upsert でデフォルト値を登録（createdAt が今に近いかどうかで初回判定は不可。
   代わりに「UserSetting が存在しない = 初回」として、upsert 前に存在確認を行う）
3. 初回の場合のみ BullMQ に「初回セットアップジョブ」を即時追加（delay: 0）
4. 通常のRepeatable Jobとは別の1回限りのジョブとして実行
```

初回セットアップジョブの処理内容:
1. **チャンネル同期**（後述「チャンネル同期フロー」と同一ロジック）を実行し、YouTubeの登録チャンネルをDBに登録する
2. 続けて**通常のポーリング処理**（§6「ジョブの流れ」Step 1〜8）を実行する

> **注**: 2回目以降のログインでは即時ジョブをエンキューしない。DBにはすでにチャンネルが存在するため、通常の Repeatable Job によるポーリングで最新状態に追従する。

### チャンネル同期フロー

初回セットアップジョブおよび手動再同期（`POST /settings/sync-channels`）で共通して使用する処理。

```
1. subscriptions.list（YouTube Data API v3）で現在の登録チャンネルを全件取得（50件/ページ・全ページ取得）
2. DBに存在しないチャンネル → 新規登録（isActive=true）
3. DBに存在し isActive=false のチャンネル → YouTubeでまだ登録中なら isActive=true に復元
4. DBに存在し isActive=true のチャンネル → YouTubeで登録解除済みなら isActive=false に更新
5. チャンネル名・アイコンURLなどのメタデータを最新の状態に更新
```

スコープ：
- `https://www.googleapis.com/auth/youtube.readonly`（登録チャンネルの読み取りのみ）

### BullMQ Worker でのOAuthトークン更新

BullMQ Worker は NextAuth のセッション層と独立して動作するため、トークン更新を独自に実装する必要がある。

```
Worker の YouTube API 呼び出しフロー:
1. DBの Account テーブルから access_token / refresh_token / expires_at を取得
2. expires_at < now() の場合 → Google Token Endpoint に refresh_token でリクエスト
   POST https://oauth2.googleapis.com/token
   { grant_type: "refresh_token", refresh_token: "...", client_id: "...", client_secret: "..." }
3. 成功 → Account.access_token と Account.expires_at を更新してジョブを継続
4. 失敗（revoked / invalid_grant 等）→ ジョブを即時 FAILED 終了・エラーログ記録
   （リトライ不要。無限リトライを防ぐため BullMQ の attempts は 1 に設定）
```

---

## 6. ポーリング設計

- BullMQ の Repeatable Job で定期実行
- デフォルト間隔：**30分**（クォータ制約による。詳細は後述のクォータ計算を参照）
- **ポーリング間隔の変更はジョブ設定の更新によって次のジョブサイクル開始時から反映される（実行中のジョブには影響しない）**

### ジョブの流れ

```mermaid
flowchart TD
    Start([ポーリング開始]) --> S1
    S1["① DBから対象チャンネルを取得\nisActive=true かつ autoPollingEnabled=true"] --> S2
    S2["② uploadsPlaylistId キャッシュ確認\n未取得分のみ channels.list でバッチ取得"] --> S3
    S3["③ playlistItems.list\n各チャンネルの最新50件を取得"] --> S4
    S4["④ 新着判定\nplatformContentId がDBになければ新着"] --> S5
    S5["⑤ videos.list でバッチ取得\n対象: 新着 / 既存LIVE / scheduledStartAt≦now のUPCOMING"] --> S6
    S6["⑥ DB UPSERT\n新着→INSERT / 既存→UPDATE\nstatus / actualStartAt / contentAt を更新"] --> S7
    S7["⑦ WatchLater 自動生成\nwatchLaterDefault=true の新着に付与"] --> S8
    S8["⑧ Web Push 通知送信\n新着動画 / ライブ開始 / 配信予告"] --> End
    End([ポーリング完了])
```

1. DBから以下の条件でポーリング対象チャンネルを取得:
   - `isActive = true`（登録解除済みチャンネルはスキップ）
   - 所属カテゴリの `NotificationSetting.autoPollingEnabled` が `true`（未分類チャンネルは対象外）
2. **`uploadsPlaylistId` のキャッシュ取得**：`Channel.uploadsPlaylistId` が `NULL` のチャンネルを最大50件ずつ `channels.list` (1 unit/call) でバッチ取得し、`contentDetails.relatedPlaylists.uploads` をDBに保存。2回目以降はDBの値を再利用（`channels.list` は呼ばない）
3. `playlistItems.list` (1 unit/call) で各チャンネルの **最新50件**を取得（`maxResults=50`）
4. **新着の判断**：取得した `platformContentId` がDBに存在しないもの = 新着コンテンツ
5. **`videos.list` による詳細取得**：以下のビデオIDをまとめて `videos.list` (1 unit/最大50件、`snippet,liveStreamingDetails` パート) でバッチ取得する：
   - 新着コンテンツのビデオID（`type` の判定・`scheduledStartAt` の取得のため）
   - DB上で `status=LIVE` の既存コンテンツのビデオID（`LIVE → ARCHIVED` / `LIVE → CANCELLED` 遷移の検出のため）
   - DB上で `status=UPCOMING` かつ **`scheduledStartAt <= now()`** の既存コンテンツのビデオID（`UPCOMING → LIVE` / `UPCOMING → CANCELLED` 遷移の検出のため）
   - IDが50件を超える場合は複数コールに分けてバッチ処理する
   - `status=UPCOMING` かつ `scheduledStartAt > now()` のコンテンツは対象外（配信予定時刻未到達のため不要）

   `scheduledStartAt <= now()` の UPCOMING コンテンツに対する `videos.list` 結果の扱い：
   - `liveBroadcastContent = live` → `status = LIVE` に更新（Step6のUPSERTで反映）
   - `liveBroadcastContent = upcoming` → `status = UPCOMING` のまま維持（配信延期。`scheduledStartAt` が変更されていれば更新）
   - `liveBroadcastContent = none` → `status = CANCELLED` に更新（Step6のUPSERTで反映）
   - レスポンスにビデオIDが含まれない（削除済み等）→ `status = CANCELLED` に更新（Step6のUPSERTで反映）

   **⑤ videos.list 結果の分岐処理（詳細）:**

   ```mermaid
   flowchart TD
       IN(["⑤ videos.list レスポンス"]) --> KIND{"コンテンツの対象種別"}

       KIND -- "新着" --> N_BC{"liveBroadcastContent"}
       N_BC -- upcoming --> N_UP["INSERT\ntype=LIVE / status=UPCOMING\nscheduledStartAt = scheduledStartTime\ncontentAt = scheduledStartAt"]
       N_BC -- live --> N_LV["INSERT\ntype=LIVE / status=LIVE\nactualStartAt = actualStartTime\ncontentAt = actualStartAt"]
       N_BC -- "none / 応答なし" --> N_VD["INSERT\ntype=VIDEO / status=ARCHIVED\ncontentAt = publishedAt"]

       KIND -- "既存 status=LIVE" --> L_BC{"liveBroadcastContent\nor ID の有無"}
       L_BC -- "none + actualEndAt あり" --> L_AR["UPDATE\nstatus=ARCHIVED\nactualEndAt = actualEndTime"]
       L_BC -- "none + actualEndAt なし\nまたは ID なし" --> L_CA["UPDATE\nstatus=CANCELLED"]

       KIND -- "既存 status=UPCOMING\n(scheduledStartAt ≤ now)" --> U_BC{"liveBroadcastContent\nor ID の有無"}
       U_BC -- live --> U_LV["UPDATE\nstatus=LIVE\nactualStartAt = actualStartTime\ncontentAt = actualStartAt"]
       U_BC -- upcoming --> U_UP["UPDATE（延期）\nscheduledStartAt 更新\ncontentAt = scheduledStartAt"]
       U_BC -- "none または ID なし" --> U_CA["UPDATE\nstatus=CANCELLED"]
   ```

6. **DBへのUPSERT**：取得したコンテンツをDBに登録・更新（新着は `INSERT`、既存は `title`・`status`・各タイムスタンプを `UPDATE`。配信予定のタイトル変更にも対応）
   `url`（コンテンツURL）の設定ルール：
   - INSERT 時にのみ設定し、以降は更新しない（不変）
   - プラットフォームごとの生成ルール：
     - YouTube: `https://www.youtube.com/watch?v={platformContentId}`（`type`・`status` によらず同一フォーマット）
     - Twitch（将来対応時）: VOD は `https://www.twitch.tv/videos/{platformContentId}`。ライブ配信は `platformContentId` ではなくチャンネル名が必要なため、実装時に別途設計する
   `contentAt`（ソートキー）の設定ルール：
   - `type=VIDEO` 新着 INSERT: `contentAt = publishedAt`（NULL の場合は `createdAt`）
   - `type=LIVE` 新着 INSERT（`status=UPCOMING`）: `contentAt = scheduledStartAt`
   - UPCOMING 延期（`scheduledStartAt` が変更された場合）: `contentAt` も同値で更新
   - `UPCOMING → LIVE` 遷移時: `actualStartAt = liveStreamingDetails.actualStartTime`（Step ⑤ の `videos.list` で取得した値）、`contentAt = actualStartAt`（`liveStreamingDetails.actualStartTime` が NULL の場合は `scheduledStartAt` にフォールバック）
7. 新着コンテンツについて、チャンネルの所属カテゴリの `NotificationSetting` を参照し `watchLaterDefault=true` であれば `WatchLater` レコードを自動生成。`autoExpireHours` はそのカテゴリの設定値を直接使用する
   - **ただし、`removedVia IS NOT NULL` のレコードが存在する場合は再追加しない**（詳細は [database.md §4](./database.md)）
   - 未分類チャンネル（`categoryId IS NULL`）は `watchLaterDefault` の設定がないため自動フラグ付けは行わない
8. 通知ONのカテゴリのチャンネルに以下のイベントがあればWeb Push送信：
   - `notifyOnNewVideo = true` かつ新しい `type=VIDEO` コンテンツが追加された場合
   - `notifyOnLiveStart = true` かつ `type=LIVE` コンテンツの `status` が `LIVE` に遷移した場合
   - `notifyOnUpcoming = true` かつ新しい `type=LIVE, status=UPCOMING` コンテンツが追加された場合

### Web Push 通知フォーマット

ポーリング Step ⑧ で送信する Web Push 通知の表示仕様。

**通知イベント種別ごとの表示内容:**

| 項目 | 新着動画 (`notifyOnNewVideo`) | ライブ開始 (`notifyOnLiveStart`) | 配信予定 (`notifyOnUpcoming`) |
|---|---|---|---|
| タイトル | `{チャンネル名}` | `{チャンネル名}` | `{チャンネル名}` |
| 本文 | `新しい動画: {動画タイトル}` | `ライブ配信中: {動画タイトル}` | `配信予定: {動画タイトル}` |
| アイコン | `Channel.iconUrl`（NULL の場合はアプリアイコン） | 同左 | 同左 |
| クリック先 | `Content.url`（YouTube の動画ページ） | 同左 | 同左 |

**同一チャンネル・同一イベント種別の複数件まとめ通知:**

同一ポーリングで同一チャンネルから同じイベント種別が複数件検出された場合、1件のまとめ通知にする。

| 項目 | 内容 |
|---|---|
| タイトル | `{チャンネル名}` |
| 本文 | `新しい動画が{N}件あります` / `{N}件のライブが開始されました` / `{N}件の配信予定があります` |
| アイコン | `Channel.iconUrl`（NULL の場合はアプリアイコン） |
| クリック先 | アプリのダッシュボード（`/`） |

異なるチャンネルまたは異なるイベント種別の通知は個別に送信する。

**通知送信数の上限:**

1回のポーリングで送信する通知は**最大5件**とする。

- 通知対象が5件以下の場合: すべて個別（またはまとめ）通知として送信
- 通知対象が6件以上の場合: 先頭5件を個別通知として送信し、残りを1件のサマリー通知にまとめる

サマリー通知の内容:

| 項目 | 内容 |
|---|---|
| タイトル | `MySubChs` |
| 本文 | `他{N}件の新着があります` |
| アイコン | アプリアイコン |
| クリック先 | アプリのダッシュボード（`/`） |

> **通知の優先順位**: 5件の枠に入れる通知の優先順位は `ライブ開始 > 配信予定 > 新着動画` の順とする。リアルタイム性の高いイベントを優先して個別通知する。

### Content.status 状態遷移規則

`Content.type` は作成時に設定され、以降は変更しない（不変フィールド）。
`Content.status` はポーリングのたびにYouTube APIの応答に基づいて更新する。

**type = VIDEO の状態遷移：**

登録時に `status = ARCHIVED`（投稿済み動画として扱う）。VIDEO は配信ではないため `UPCOMING` / `LIVE` / `CANCELLED` には遷移しない。

**type = LIVE の状態遷移：**

```
UPCOMING → LIVE → ARCHIVED
    │
    └──→ CANCELLED（終端）
```

| 遷移 | 条件 |
|---|---|
| 新規登録 → `UPCOMING` | `videos.list` で `liveBroadcastContent = upcoming` かつ `scheduledStartAt` あり |
| 新規登録 → `LIVE` | `videos.list` で `liveBroadcastContent = live` |
| `UPCOMING` → `LIVE` | `scheduledStartAt <= now()` となった UPCOMING コンテンツを `videos.list` で確認し、`liveBroadcastContent = live` の場合 |
| `LIVE` → `ARCHIVED` | `videos.list` で `liveBroadcastContent = none` かつ `actualEndAt` あり |
| `UPCOMING` → `CANCELLED` | `scheduledStartAt <= now()` となった UPCOMING コンテンツを `videos.list` で確認し、コンテンツが取得できない、または `liveBroadcastContent = none` の場合 |
| `CANCELLED` | 終端状態。これ以上遷移しない |
| `ARCHIVED` | 終端状態。これ以上遷移しない |

**状態遷移図（type=LIVE）:**

```mermaid
stateDiagram-v2
    [*] --> UPCOMING : 新規登録 (liveBroadcastContent=upcoming)
    [*] --> LIVE : 新規登録 (liveBroadcastContent=live)
    [*] --> ARCHIVED : VIDEO 新規登録 (type=VIDEO)

    UPCOMING --> LIVE : live 確認\nactualStartAt = actualStartTime を記録
    UPCOMING --> CANCELLED : none またはID取得不可
    LIVE --> ARCHIVED : none + actualEndAt あり
    LIVE --> CANCELLED : none + actualEndAt なし / ID取得不可

    CANCELLED : CANCELLED（終端）
    ARCHIVED : ARCHIVED（終端）
```

> **延期（UPCOMING のまま）**: `liveBroadcastContent=upcoming` かつ `scheduledStartAt` が変更された場合は状態は `UPCOMING` のままで `scheduledStartAt` と `contentAt` のみ更新する（状態遷移は発生しない）。

**CANCELLED の扱い：**
- `type` は `LIVE` のまま変更しない（配信予定だったという事実を保持）
- `status = CANCELLED` のコンテンツは**デフォルトで動画一覧に表示しない**。フィルター「キャンセル済みも表示」をONにした場合のみ「キャンセル済み」バッジ付きで表示される

### WatchLaterCleanup ジョブ

- BullMQ Repeatable Job で毎日定期実行
- **`expiresAt < NOW()` のレコードを即時一括削除（グレース期間なし）**
- `removedVia IS NOT NULL` のレコードは失効日時に関わらず削除しない（ポーリング除外の記録として永続保持）
- 補足：`Content` が ContentCleanup ジョブで物理削除された場合、紐付く `WatchLater` は `onDelete: Cascade` で自動削除されるため、WatchLaterCleanup との処理の重複はない

### ContentCleanup ジョブ

- BullMQ Repeatable Job で**毎日1回**定期実行
- `UserSetting.contentRetentionDays` を参照して削除基準日を計算し、基準日より古い `Content` を物理削除する
- **削除基準日時**:
  - `type=VIDEO`: `publishedAt`（NULL の場合は `createdAt` にフォールバック）
  - `type=LIVE`: `scheduledStartAt`（NULL の場合は `createdAt` にフォールバック）
- **削除対象外**: `status=LIVE`（配信中）のコンテンツは削除しない
- **「後で見る」フラグの扱い**: フラグON（`removedVia IS NULL`）のコンテンツも例外なく削除対象とする
- `WatchLater` は `Content.onDelete: Cascade` により自動削除されるため、個別削除は不要

### YouTube APIクォータ管理

エンドポイント別のコストと利用方針の詳細は [ref/youtube-api.md §7](../ref/youtube-api.md) を参照。

**クォータ消費量の試算（想定チャンネル数〜100本）:**

```
playlistItems.list: 1 unit/call × 100チャンネル = 100 units/ポーリング
videos.list: 新着 + LIVE件数 + 予定時刻超過UPCOMING件数を50件ずつバッチ処理。通常1〜2 units/ポーリング（≒2 units と試算。予定時刻超過UPCOMINGは少数のため既存バッチに吸収）
uploadsPlaylistId キャッシュ後: channels.list コスト = 0

合計 ≒ 102 units/ポーリング
ポーリング間隔別 1日のユニット消費:
  5分  → 102 × 288 ≒ 29,400 units  ⚠️ 上限 (10,000) 超過
  10分 → 102 × 144 ≒ 14,700 units  ⚠️ 上限超過
  30分 → 102 × 48  ≒  4,900 units  ✅ 安全（上限の49%）
  1時間 → 102 × 24 ≒  2,400 units  ✅ 安全（上限の24%）

手動チャンネル再同期時（設定画面）:
  subscriptions.list: 100チャンネル ÷ 50件/call = 2 units
  channels.list（メタデータ更新）: 100チャンネル ÷ 50件/call = 2 units
  合計 ≒ 4 units/回（1日のクォータの0.04%。クォータ的に無視できるレベル）
```

- **デフォルトポーリング間隔は30分**（上記クォータ制約による）
- 設定画面で5分・10分を選択した場合、チャンネル数が多いとクォータ超過リスクがある旨の警告をUIに表示する（チャンネル数 × 1日のポーリング回数 > 9,000 ユニットで警告）
- クォータ枯渇時: YouTube API が `quotaExceeded (403)` を返す → ジョブを即時終了し次のスケジュール時刻まで待機（リトライなし）

### 手動ポーリング API

カテゴリ単位で即時ポーリングをトリガーするAPIエンドポイント。

```
POST /api/categories/{categoryId}/poll
```

- 認証必須（自分のカテゴリのみ操作可能）
- `autoPollingEnabled = false` のカテゴリでも実行可能
- 対象チャンネル: 指定カテゴリに属するチャンネルのみ（`Channel.categoryId = categoryId`）
- BullMQ に one-off ジョブとしてエンキュー。定期ポーリングジョブと同一ロジックを再利用し、対象チャンネルリストのみ絞り込む
- レスポンス: `{ queued: true }` を即時返却（ジョブ完了を待たない）

**ジョブ識別・保持設定:**

- jobId: `manual-poll:{categoryId}`（BullMQ でのジョブルックアップを可能にする）
- エンキュー時のジョブ保持設定:
  - `removeOnComplete: { age: 60 }`（完了後60秒保持。クライアントの完了検知に十分な時間）
  - `removeOnFailed: { age: 300 }`（失敗後5分保持）

**クールダウン（クォータ過剰消費防止）:**

- 同一カテゴリへの手動ポーリングは最低**5分間のクールダウン**を設ける
- 実装：Redis に `manual-poll:cooldown:{categoryId}` キーを TTL=300秒 でセット
- クールダウン中のリクエストは `{ queued: false, reason: "cooldown", retryAfter: <残り秒数> }` を返す（HTTP 429）
- UIはこのレスポンスを受けてボタンを非活性化し残り時間を表示する

**ジョブステータス確認 API:**

```
GET /api/categories/{categoryId}/poll/status
```

クライアントが手動ポーリングの完了を検知するためのエンドポイント。

レスポンス:
```json
{
  "status": "none" | "waiting" | "active" | "completed" | "failed",
  "cooldownRemaining": 180
}
```

- `status`: `queue.getJob("manual-poll:{categoryId}")` でジョブを取得し `job.getState()` で取得。ジョブが存在しない場合は `"none"`
- `cooldownRemaining`: Redis の `manual-poll:cooldown:{categoryId}` TTL から計算した残クールダウン秒数（0 = クールダウンなし）

**クライアント側のポーリング完了検知フロー:**

POST 後:
1. ボタンを「実行中」状態（スピナー）に設定
2. `GET .../poll/status` を **3秒間隔・最大100回** でポーリング開始（上限 = 5分）

ステータス確認ループ:
- `status = "active"` or `"waiting"` → 「実行中」状態を維持、ポーリング継続
- `status = "completed"` or `"none"` → ポーリング停止 → コンテンツ一覧を refetch → `cooldownRemaining > 0` ならボタンを「クールダウン中」状態へ
- `status = "failed"` → ポーリング停止 → エラートースト表示 → コンテンツ一覧を refetch → `cooldownRemaining > 0` ならボタンを「クールダウン中」状態へ
- 100回到達（タイムアウト）→ ポーリング停止 → タイムアウトエラートースト表示 → 通常状態に戻す

ページロード時:
- `GET .../poll/status` を1回呼び出して状態を復元:
  - `status = "active"` or `"waiting"` → 「実行中」状態でポーリング再開（3秒間隔・残回数はリセットして最大100回）
  - `status = "completed"` or `"none"` かつ `cooldownRemaining > 0` → 「クールダウン中」状態で表示
  - それ以外 → 通常状態

### ポーリングジョブの重複実行防止

BullMQ Repeatable Job はデフォルトで前のジョブが完了前に次のジョブを開始する可能性がある。以下の設計で重複実行を防止する。

- **固定 `jobId`**：Repeatable Job に `jobId: "polling-job"` を設定（同名ジョブの多重スケジュール防止）
- **Redis ロック**：ジョブ開始時に `SET polling:lock NX PX <interval_ms>` でロック取得。取得失敗（前のジョブが実行中）の場合はそのジョブを即時スキップ（正常完了として終了）

---

## 7. Docker Compose 構成

```yaml
services:
  app:       # Next.js
  worker:    # BullMQ Worker（appと同イメージ、別エントリーポイント）
  db:        # PostgreSQL
  redis:     # Redis
```

---

## 8. 環境変数

```env
# 認証
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# YouTube API
YOUTUBE_API_KEY=

# DB
DATABASE_URL=

# Redis
REDIS_URL=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## 9. カーソルページネーション設計

`GET /contents` のページネーションにはキーセットページネーション（Keyset Pagination）を採用する。

### 採用方式：キーセットページネーション

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

## 10. AWS移行時の対応方針

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
