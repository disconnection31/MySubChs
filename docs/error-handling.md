# エラーハンドリング仕様書 - MySubChs

## 1. API エラーレスポンス形式

### 1.1 統一エラーオブジェクト

全APIエンドポイントのエラーレスポンスは以下の形式で統一する。

```json
{
  "error": {
    "code": "CATEGORY_NOT_FOUND",
    "message": "指定されたカテゴリが見つかりません"
  }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `error.code` | string | 機械読み取り用のエラーコード（`SNAKE_UPPER_CASE`） |
| `error.message` | string | 人間向けの説明文（日本語） |

バリデーションエラーの場合は `details` フィールドを追加する。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": [
      { "field": "name", "message": "カテゴリ名は50文字以内で入力してください" }
    ]
  }
}
```

### 1.2 HTTP ステータスコードの用途

| ステータスコード | 用途 |
|---|---|
| `400 Bad Request` | リクエスト形式・バリデーションエラー |
| `401 Unauthorized` | 未認証（セッションなし・有効期限切れ） |
| `404 Not Found` | リソースが存在しない |
| `409 Conflict` | 重複・整合性エラー（名前重複など） |
| `429 Too Many Requests` | クールダウン中（手動ポーリング） |
| `500 Internal Server Error` | 予期しないサーバーエラー |
| `503 Service Unavailable` | 外部サービス（YouTube API等）が一時的に使用不可 |

---

## 2. エラーコード一覧

### 2.1 共通エラーコード

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未認証アクセス |
| `VALIDATION_ERROR` | 400 | 入力値バリデーション失敗 |
| `INTERNAL_SERVER_ERROR` | 500 | 予期しないサーバーエラー |

### 2.2 カテゴリ（`/api/categories`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | 指定IDのカテゴリが存在しない |
| `CATEGORY_NAME_DUPLICATE` | 409 | 同名のカテゴリが既に存在する |
| `CATEGORY_NAME_TOO_LONG` | 400 | カテゴリ名が50文字を超える |
| `CATEGORY_NAME_EMPTY` | 400 | カテゴリ名が空 |

### 2.3 チャンネル（`/api/channels`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `CHANNEL_NOT_FOUND` | 404 | 指定IDのチャンネルが存在しない |
| `CATEGORY_NOT_FOUND` | 404 | 割り当て先カテゴリが存在しない |

### 2.4 コンテンツ（`/api/contents`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | 指定IDのコンテンツが存在しない |
| `INVALID_CURSOR` | 400 | カーソルのBase64デコード・JSON解析に失敗 |

### 2.5 後で見る（`/api/watch-later`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | 指定IDのコンテンツが存在しない |

### 2.6 手動ポーリング（`/api/categories/{id}/poll`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | 指定IDのカテゴリが存在しない |
| `POLLING_COOLDOWN` | 429 | クールダウン中（5分以内に再実行） |

クールダウン時のレスポンス形式：

```json
{
  "error": {
    "code": "POLLING_COOLDOWN",
    "message": "手動ポーリングは5分間隔でのみ実行できます",
    "retryAfter": 180
  }
}
```

`retryAfter`: クールダウン残り秒数（整数）

### 2.7 設定・チャンネル同期（`/api/settings`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `INVALID_POLLING_INTERVAL` | 400 | 有効でないポーリング間隔値（5/10/30/60 以外） |
| `INVALID_RETENTION_DAYS` | 400 | 有効でないコンテンツ保持期間値 |
| `YOUTUBE_API_ERROR` | 503 | チャンネル同期中にYouTube APIがエラーを返した |
| `OAUTH_TOKEN_INVALID` | 503 | OAuthトークンが無効・失効している |

### 2.8 通知（`/api/notifications`）

| エラーコード | HTTP | 発生条件 |
|---|---|---|
| `PUSH_SUBSCRIPTION_NOT_FOUND` | 404 | Push購読が存在しない |
| `PUSH_SEND_FAILED` | 503 | Web Push送信失敗（テスト送信時） |

---

## 3. バックグラウンドジョブのエラー処理

### 3.1 BullMQ 設定方針

ジョブ種別ごとのリトライ設定：

| ジョブ | `attempts` | `backoff` | 理由 |
|---|---|---|---|
| ポーリングジョブ（定期） | 1 | なし | 次のサイクルに委ねる。過剰リトライによるクォータ枯渇を防ぐ |
| 初回セットアップジョブ | 3 | exponential 1分 | 初回のみ重要。一時的な失敗をリカバリーする |
| WatchLaterCleanup | 3 | exponential 5分 | 翌日まで待てないためリトライする |
| ContentCleanup | 3 | exponential 5分 | 同上 |

### 3.2 YouTube API エラー別の挙動（ポーリングジョブ）

| エラー種別 | HTTP / コード | 挙動 |
|---|---|---|
| クォータ枯渇 | 403 `quotaExceeded` | ジョブを即時 **FAILED** で終了。次のスケジュール時刻まで待機（リトライなし） |
| OAuthトークン無効 | 401 `invalid_grant` / `TOKEN_REVOKED` | ジョブを即時 **FAILED** で終了（リトライなし）。エラーログに記録 |
| 一時的なサーバーエラー | 500 / 503 | ジョブを **FAILED** で終了。次のスケジュールに委ねる（リトライなし） |
| レートリミット | 429 | ジョブを **FAILED** で終了。次のスケジュールに委ねる（リトライなし） |
| 個別チャンネルのAPIエラー | 任意 | そのチャンネルをスキップして処理を継続。エラーをログに記録 |
| ネットワークタイムアウト | - | ジョブを **FAILED** で終了。次のスケジュールに委ねる（リトライなし） |

> **設計原則**: ポーリングジョブは失敗時にリトライしない。頻繁なリトライはクォータ枯渇・無限ループのリスクがあり、次のスケジュール（最短5分後）で自然に回復するため。

### 3.3 OAuthトークン更新の失敗

`architecture.md §5` に記述のとおり、BullMQ Worker はトークン更新を独自に実装する。失敗ケースの処理：

| 失敗パターン | 挙動 |
|---|---|
| `invalid_grant`（失効） | ジョブを即時 FAILED 終了。`attempts=1` でリトライなし |
| `invalid_client`（設定誤り） | 同上 |
| ネットワークエラー（一時的） | ジョブを FAILED 終了。次のサイクルで再試行される |

トークン更新失敗時はエラーログに `{ type: "TOKEN_REFRESH_FAILED", reason: <エラー内容> }` を記録する。

### 3.4 個別チャンネルのエラー処理

ポーリングジョブは1チャンネルのエラーで全体を停止しない。

```
チャンネル単位の処理フロー:
1. playlistItems.list 呼び出し
   ↓ エラー（403/404/500等）
2. そのチャンネルをスキップ → Channel.lastPolledAt は更新しない
3. エラーをログに記録（channelId, platform, errorCode）
4. 次のチャンネルの処理へ進む
```

ただし `quotaExceeded (403)` はチャンネル単位ではなくプロジェクト全体のクォータ枯渇を意味するため、**その時点でジョブ全体を即時終了する**。

### 3.5 Web Push 通知送信エラー

| エラー種別 | 挙動 |
|---|---|
| `410 Gone`（購読失効） | `PushSubscription` レコードを DB から削除する |
| `400 Bad Request`（不正なサブスクリプション） | 同上 |
| その他のエラー | ログに記録してスキップ。通知失敗でポーリング処理は止めない |

---

## 4. フロントエンドのエラー UI

### 4.1 エラー表示の使い分け

| エラー種別 | 表示方法 | 具体例 |
|---|---|---|
| 操作フィードバック（成功・失敗） | トースト（下部中央） | 「カテゴリを作成しました」「カテゴリの作成に失敗しました」 |
| フォームのバリデーションエラー | インラインエラー（フィールド直下） | 「カテゴリ名を入力してください」 |
| ページ全体のデータ取得失敗 | エラーバナー（コンテンツ領域内） | 「コンテンツの取得に失敗しました。再試行してください」 |
| 手動ポーリングのクールダウン | インライン（ボタン下テキスト） | 「あと2分後に実行できます」 |
| 認証切れ（401） | フルページリダイレクト | ログイン画面へリダイレクト |

### 4.2 TanStack Query のエラー状態

TanStack Query の `useQuery` / `useMutation` を使用し、以下の方針でエラーを処理する。

**データ取得（`useQuery`）の失敗:**

```
- isError = true のとき、エラーバナーを表示する
- エラーバナーには「再試行」ボタンを配置し、クリックで refetch() を実行する
- staleTime / retryDelay は TanStack Query のデフォルト設定を使用する
```

**ミューテーション（`useMutation`）の失敗:**

```
- onError コールバックでトーストを表示する
- 楽観的更新を使った場合は onError でキャッシュをロールバックする
- バリデーションエラー（400）はフォームのエラーメッセージとして表示する
```

**401 Unauthorized の扱い:**

```
- 全 API 呼び出しで 401 が返った場合、NextAuth の signOut() を呼び出してログイン画面へリダイレクトする
- グローバルな QueryClient の defaultOptions.queries.onError で共通処理する
```

### 4.3 楽観的更新とロールバック

楽観的更新を行う操作：

| 操作 | 楽観的更新の内容 |
|---|---|
| 「後で見る」トグル | UI上のフラグを即時切り替え → 失敗時にロールバック＋トースト表示 |
| チャンネルのカテゴリ割り当て | 割り当て結果を即時反映 → 失敗時にロールバック＋トースト表示 |
| カテゴリの並び替え（D&D） | ドロップ時に即時並び替え → 失敗時にロールバック＋トースト表示 |
| カテゴリ通知設定変更 | 設定値を即時反映 → 失敗時にロールバック＋トースト表示 |
| ユーザー設定変更 | 設定値を即時反映 → 失敗時にロールバック＋トースト表示 |

その他の操作（カテゴリ作成・削除等）は楽観的更新を行わず、APIレスポンスを待ってから画面を更新する。

### 4.4 エラーメッセージ文言

APIエラーコードに対応するユーザー向けメッセージの対応表。`message` フィールドの値をそのまま使用する場合と、フロントエンド側で上書きする場合を区別する。

| エラーコード | 表示方法 | メッセージ（日本語） |
|---|---|---|
| `CATEGORY_NOT_FOUND` | トースト（エラー） | カテゴリが見つかりません |
| `CATEGORY_NAME_DUPLICATE` | インラインエラー | 同じ名前のカテゴリが既に存在します |
| `CATEGORY_NAME_TOO_LONG` | インラインエラー | カテゴリ名は50文字以内で入力してください |
| `CATEGORY_NAME_EMPTY` | インラインエラー | カテゴリ名を入力してください |
| `POLLING_COOLDOWN` | インライン（ボタン下） | あと{retryAfter}秒後に実行できます |
| `YOUTUBE_API_ERROR` | トースト（エラー） | YouTube APIでエラーが発生しました。しばらく待ってから再試行してください |
| `OAUTH_TOKEN_INVALID` | トースト（エラー） | 認証が無効になっています。再ログインしてください |
| `PUSH_SEND_FAILED` | トースト（エラー） | 通知の送信に失敗しました |
| `INTERNAL_SERVER_ERROR` | トースト（エラー） | エラーが発生しました。しばらく待ってから再試行してください |

### 4.5 手動ポーリングのフィードバック

手動ポーリング（「今すぐポーリング」ボタン）は非同期でジョブをエンキューする設計（`{ queued: true }` を即時返却）のため、ジョブの完了はPollingによって検知する。

```
ポーリングボタンの状態遷移:
1. クリック → ローディング状態（ボタン非活性化）
2. APIレスポンス受信（成功）→ 「更新中...」表示 + React Query の refetch を開始
3. refetch完了 → 通常状態に戻す
4. APIレスポンス受信（429 POLLING_COOLDOWN）→ ボタン非活性化 + 残り時間を表示
5. APIレスポンス受信（その他エラー）→ トースト（エラー）表示 + ボタンを通常状態に戻す
```

---

## 5. ロギング方針

### 5.1 ログ出力先

初期構成（Docker）では `console.error` / `console.warn` / `console.info` を使用し、標準出力へ出す（Docker logs で参照可能）。AWS移行後は CloudWatch Logs に集約する。

### 5.2 ログレベルの使い分け

| レベル | 用途 | 例 |
|---|---|---|
| `error` | 処理の失敗・例外 | YouTube API エラー、ジョブ失敗、トークン更新失敗 |
| `warn` | 業務上の警告 | クォータ枯渇、個別チャンネルのスキップ |
| `info` | 主要な処理の開始・完了 | ポーリング開始/完了、チャンネル同期完了 |

### 5.3 ログのフォーマット

構造化ログ（JSON形式）を推奨するが、初期実装ではプレーンテキストで可。含めるべき情報：

```
[level] [timestamp] [context] message { structured data }

例:
[error] 2026-03-03T10:00:00Z [polling] YouTube API quota exceeded { quotaExceeded: true, channelCount: 100 }
[warn]  2026-03-03T10:01:00Z [polling] Channel skipped due to API error { channelId: "UC...", error: "404" }
[info]  2026-03-03T10:02:00Z [polling] Polling completed { channelCount: 100, newContents: 3, elapsed: "12.3s" }
```
