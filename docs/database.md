# DBスキーマ設計書 - MySubChs

## 1. ER図（概要）

```
User ──< Account (NextAuth)
User ──< Category
User ──< Channel
Channel >── Category   (チャンネルはひとつのカテゴリに所属、またはカテゴリなし)
Channel ──< Content
User ──< WatchLater    (Content と User の「後で見る」状態)
Content ──< WatchLater
User ──< PushSubscription
Category ──| NotificationSetting  (1:1。watchLaterDefault, autoExpireHours, notifyOnUpcoming, autoPollingEnabled を含む。カテゴリ作成時にデフォルト値で自動生成する)
User ──| UserSetting              (1:1。ポーリング間隔・コンテンツ保持期間を管理。ユーザー初回ログイン時にデフォルト値で自動生成する)
```

---

## 2. テーブル定義

### User
NextAuthが管理するユーザーテーブル。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| name | String? | 表示名 |
| email | String? | メールアドレス |
| emailVerified | DateTime? | メール認証日時 |
| image | String? | アバター画像URL |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |

---

### Account
NextAuthが管理するOAuthアカウント情報。アクセストークン・リフレッシュトークンを保持。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User |
| type | String | OAuth種別 |
| provider | String | "google" |
| providerAccountId | String | GoogleのユーザーID |
| access_token | String? | アクセストークン |
| refresh_token | String? | リフレッシュトークン |
| expires_at | Int? | トークン有効期限 |
| scope | String? | 付与スコープ |

---

### Category
ユーザーが作成するチャンネルの分類グループ。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User |
| name | String | カテゴリ名 |
| sortOrder | Int | 表示順（昇順） |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |

---

### Channel
登録チャンネル情報。プラットフォームを問わず統一して管理。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User |
| platform | String | "youtube" / "twitch" など |
| platformChannelId | String | 各プラットフォームのチャンネルID |
| name | String | チャンネル名 |
| iconUrl | String? | チャンネルアイコンURL |
| uploadsPlaylistId | String? | YouTubeのアップロードプレイリストID（キャッシュ）。`channels.list` で初回取得後DBに保存し、以降は再取得不要 |
| lastPolledAt | DateTime? | 最終ポーリング日時 |
| categoryId | String? | FK → Category。NULL = 未分類 |
| isActive | Boolean | アクティブ状態（default: true）。登録解除時に false になる |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |

インデックス：`(userId, platform, platformChannelId)` UNIQUE

---

### Content
動画・ライブ配信・配信予定を統一して管理するテーブル。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| channelId | String | FK → Channel |
| platform | String | "youtube" など（冗長化で検索を最適化） |
| platformContentId | String | 各プラットフォームのコンテンツID |
| title | String | タイトル |
| type | Enum (ContentType, immutable) | `VIDEO`（動画）/ `LIVE`（ライブ配信全般）。作成後は変更しない |
| status | Enum (ContentStatus) | `UPCOMING`（配信予定）/ `LIVE`（配信中）/ `ARCHIVED`（アーカイブ済）/ `CANCELLED`（キャンセル）。ポーリングで更新される |
| publishedAt | DateTime? | 動画投稿日時（VIDEOの場合） |
| scheduledStartAt | DateTime? | 配信予定開始時刻（type=LIVE の場合） |
| actualStartAt | DateTime? | 実際の配信開始時刻（`liveStreamingDetails.actualStartTime` のマッピング。配信開始後に取得可能） |
| actualEndAt | DateTime? | 配信終了時刻（`liveStreamingDetails.actualEndTime` のマッピング） |
| contentAt | DateTime | ソート専用キー。type・status に応じて以下の値を格納する（詳細は architecture.md §6 参照）: VIDEO = `publishedAt`、LIVE UPCOMING = `scheduledStartAt`、LIVE（配信開始後）= `actualStartAt` |
| url | String | コンテンツURL |
| createdAt | DateTime | DB登録日時 |
| updatedAt | DateTime | 更新日時 |

インデックス：`(platform, platformContentId)` UNIQUE、`contentAt`（ソートパフォーマンス用）

> **type と status の設計方針**
> - `type` はコンテンツの種別を表す**不変**フィールド。`VIDEO` は投稿動画、`LIVE` はライブ配信（予定中・配信中・終了後のすべてを含む）。
> - `status` はコンテンツの現在の**状態**を表す可変フィールド。ポーリングのたびに更新される。
> - `type=LIVE` のレコードが `status=CANCELLED` になることがある（配信予定がキャンセルされた場合）。
> - 表示上の「ライブ中」「配信予定」「アーカイブ」の区別は `status` フィールドのみで判断する。

---

### WatchLater
ユーザーごとのコンテンツ「後で見る」状態。`removedVia IS NULL` のレコード存在 = フラグON。`removedVia IS NOT NULL` = ユーザーが手動削除済み（ポーリング再追加防止のためレコードを保持）。レコードなし = 一度もフラグが付いていない状態。

| カラム | 型 | 説明 |
|---|---|---|
| userId | String | FK → User |
| contentId | String | FK → Content |
| addedVia | Enum (WatchLaterSource) | `MANUAL`（手動）/ `AUTO`（カテゴリ自動） |
| removedVia | TEXT? | NULL = アクティブ、`'MANUAL'` = ユーザーが手動削除。ポーリングは NOT NULL の場合に再追加をスキップ |
| expiresAt | DateTime? | 失効日時。NULL = 失効なし（手動追加時はNULL） |
| addedAt | DateTime | フラグを付けた日時 |

PK：`(userId, contentId)`
インデックス：`(userId, expiresAt)`

---

### NotificationSetting
カテゴリごとの通知・ポーリング設定。**カテゴリ作成時にデフォルト値（notifyOnNewVideo=true, notifyOnLiveStart=true, notifyOnUpcoming=false, watchLaterDefault=false, autoExpireHours=NULL, autoPollingEnabled=true）で自動生成される。** これにより `NotificationSetting` が存在しないカテゴリは発生しない。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User |
| categoryId | String | FK → Category |
| notifyOnNewVideo | Boolean | 新着動画通知（default: true） |
| notifyOnLiveStart | Boolean | ライブ開始通知（default: true） |
| notifyOnUpcoming | Boolean | 配信予定登録通知（default: false） |
| watchLaterDefault | Boolean | 新着コンテンツに自動で後で見るフラグを付ける（default: false） |
| autoExpireHours | Int? | 自動失効時間（時間単位）。NULL = 失効なし。watchLaterDefaultがtrueの場合のみ有効 |
| autoPollingEnabled | Boolean | 定期ポーリングの有効/無効（default: true）。falseのカテゴリのチャンネルは定期ポーリング対象から除外される。手動ポーリングは設定に関わらず実行可能 |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |

インデックス：`(userId, categoryId)` UNIQUE

---

### PushSubscription
Web Push通知用のサブスクリプション情報。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User |
| endpoint | String | Push通知エンドポイントURL（UNIQUE） |
| p256dh | String | 公開鍵 |
| auth | String | 認証シークレット |
| userAgent | String? | 登録デバイスのUA |
| createdAt | DateTime | 作成日時 |

インデックス：`endpoint` UNIQUE（upsert のキー）

---

### UserSetting
ユーザーごとのアプリ設定。**ユーザー初回ログイン時にデフォルト値で自動生成する**（`NotificationSetting` と同じパターン）。

| カラム | 型 | 説明 |
|---|---|---|
| id | String (UUID) | PK |
| userId | String | FK → User (UNIQUE) |
| pollingIntervalMinutes | Int | ポーリング間隔（分）。デフォルト: 30。選択肢: 5/10/30/60 |
| contentRetentionDays | Int | コンテンツ保持期間（日）。デフォルト: 60（2ヶ月）。選択肢: 30/60/90/180/365 |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |

インデックス：`userId` UNIQUE

---

## 3. Prismaスキーマ（参考）

```prisma
enum ContentType {
  VIDEO  // 投稿動画。不変。
  LIVE   // ライブ配信（予定中・配信中・終了後のすべてを含む）。不変。
}

enum ContentStatus {
  UPCOMING   // 配信予定（type=LIVE のみ）
  LIVE       // 配信中（type=LIVE のみ）
  ARCHIVED   // アーカイブ済（type=VIDEO または type=LIVE の配信終了後）
  CANCELLED  // キャンセル（type=LIVE のみ。配信予定がキャンセルされた場合）
}

enum WatchLaterSource {
  MANUAL
  AUTO
}

model Category {
  id           String   @id @default(uuid())
  userId       String
  name         String
  sortOrder    Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User                 @relation(fields: [userId], references: [id])
  channels     Channel[]
  notification NotificationSetting?
}

model Channel {
  id                String    @id @default(uuid())
  userId            String
  platform          String    // "youtube" | "twitch"
  platformChannelId String
  name              String
  iconUrl             String?
  uploadsPlaylistId   String?   // YouTubeのアップロードプレイリストID。初回ポーリング時に channels.list で取得してキャッシュ
  lastPolledAt        DateTime?
  categoryId          String?   // FK → Category。NULL = 未分類
  isActive            Boolean   @default(true)
  // isActive = false のチャンネルはポーリング対象から除外する
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user              User      @relation(fields: [userId], references: [id])
  category          Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  contents          Content[]

  @@unique([userId, platform, platformChannelId])
}

model Content {
  id                String        @id @default(uuid())
  channelId         String
  platform          String
  platformContentId String
  title             String
  type              ContentType
  status            ContentStatus @default(ARCHIVED)  // 動画はARCHIVED、ライブ予定はUPCOMINGで登録（デフォルトはフォールバック用）
  publishedAt       DateTime?
  scheduledStartAt  DateTime?
  actualStartAt     DateTime?
  actualEndAt       DateTime?
  contentAt         DateTime      // ソート専用キー（architecture.md §6 参照）
  url               String
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  channel           Channel       @relation(fields: [channelId], references: [id])
  watchLaters       WatchLater[]

  @@unique([platform, platformContentId])
  @@index([contentAt])
}

model WatchLater {
  userId      String
  contentId   String
  addedVia    WatchLaterSource @default(MANUAL)
  removedVia  String?          // NULL = アクティブ。'MANUAL' = ユーザーが手動削除。ポーリングはNOT NULLの場合再追加しない
  expiresAt   DateTime?
  addedAt     DateTime         @default(now())

  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  content     Content @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@id([userId, contentId])
  @@index([userId, expiresAt])
}

model NotificationSetting {
  id                   String   @id @default(uuid())
  userId               String
  categoryId           String
  notifyOnNewVideo     Boolean  @default(true)
  notifyOnLiveStart    Boolean  @default(true)
  notifyOnUpcoming     Boolean  @default(false)
  watchLaterDefault    Boolean  @default(false)
  autoExpireHours      Int?
  autoPollingEnabled   Boolean  @default(true)  // falseのカテゴリのチャンネルは定期ポーリング対象外（手動ポーリングは常に可能）
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category             Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([userId, categoryId])
}

model UserSetting {
  id                       String   @id @default(uuid())
  userId                   String   @unique
  pollingIntervalMinutes   Int      @default(30)   // 選択肢: 5/10/30/60
  contentRetentionDays     Int      @default(60)   // 選択肢: 30/60/90/180/365（2ヶ月=60日がデフォルト）
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  user  User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 4. 設計上の考慮点

- **`platform` フィールドの冗長化**：将来のマルチプラットフォーム対応のため、`Channel`・`Content` 両方に `platform` を持たせる。JOIN不要で高速にフィルタリングできる。
- **`WatchLater` の遅延生成**：後で見る状態はレコードが存在しない場合を「フラグなし」として扱い、フラグON時に初めてレコードを作成する（INSERT件数を最小化）。手動削除（フラグOFF）は `removedVia = 'MANUAL'` を設定してレコードを保持する（再追加防止のため）。
- **`WatchLater.expiresAt` のLazy評価**：失効判定はクエリ時に `expiresAt IS NULL OR expiresAt > NOW()` でフィルタリングする。別途バックグラウンドジョブが `expiresAt < NOW()` のレコードを定期削除する（即時クリーンアップ。グレース期間なし）。`removedVia IS NOT NULL` のレコードは削除対象ではなく保持し続ける（ポーリング除外の記録として使用）。
- **`autoExpireHours` の単位変換**：DBは `autoExpireHours`（時間単位）で保存するが、UI上は「1日 / 3日 / 1週間 / 2週間 / 失効なし」の選択肢で表示する。UI→DB変換：1日=24h、3日=72h、1週間=168h、2週間=336h。表示時は逆変換する。
- **手動追加の優先**：手動でフラグを付けた場合（`addedVia = MANUAL`）は `expiresAt = NULL` となり、カテゴリの自動失効設定より優先される。同一コンテンツに `AUTO` エントリが存在する場合はMANUALで上書きする（ON CONFLICT UPDATE）。なお、`removedVia = 'MANUAL'` のコンテンツをユーザーが再度手動でONにした場合は、ON CONFLICT UPDATE で `addedVia = MANUAL, removedVia = NULL, expiresAt = NULL` に更新する（ポーリング除外が解除される）。その後のポーリングでは `removedVia IS NULL` のため自動フラグ付けの対象に含まれうるが、既にアクティブなレコードが存在するため実質的な変更はない。
- **カテゴリ削除時のチャンネル扱い**：カテゴリを削除すると `Channel.categoryId` が `NULL` に更新され（`onDelete: SetNull`）、チャンネル自体はDBに残る。削除後に `categoryId IS NULL` のチャンネルは「未分類」として扱われる（チャンネル自体の削除は行わない）。
- **`WatchLater.removedVia` による再追加防止**：ユーザーが手動で「後で見る」を削除した場合、レコードを物理削除する代わりに `removedVia = 'MANUAL'` を設定してレコードを保持する。ポーリング時の自動付与ロジックは `removedVia IS NOT NULL` のレコードが存在する場合、そのコンテンツへの `WatchLater` 再追加をスキップする。
- **`Content.status` の状態遷移**：`type` は不変だが `status` はポーリングのたびに更新される。遷移規則は architecture.md のセクション6を参照。
- **`UserSetting` の初回生成**：ユーザー初回ログイン時（NextAuthのコールバック）に `pollingIntervalMinutes=30、contentRetentionDays=60` のデフォルト値でレコードを自動生成する。これにより `UserSetting` が存在しないユーザーは発生しない（`NotificationSetting` と同じパターン）。
- **`pollingIntervalMinutes` の管理**：ポーリング間隔は `UserSetting.pollingIntervalMinutes` で管理する。設定画面からの変更は次のジョブサイクル開始時から反映される。
- **`autoPollingEnabled` の判定**：チャンネルの所属カテゴリの `autoPollingEnabled` が `true` であれば定期ポーリングの対象とする。未分類チャンネル（`categoryId IS NULL`）は定期ポーリング対象外とする。
- **コンテンツ削除時の `WatchLater` の扱い**：`Content` を物理削除すると `WatchLater.onDelete: Cascade` により紐付く `WatchLater` レコードも自動削除される。`removedVia IS NOT NULL`（手動削除済み）レコードも同様に消去される。2ヶ月以上前のコンテンツはポーリングで再取得されないため（最新50件のみ取得）、`removedVia` による再追加防止記録が失われても実害はない。
