# エラーハンドリング仕様書 - MySubChs

> **スコープ**: API エラーレスポンス形式、エラーコード一覧、ロギング方針を扱う。バックグラウンドジョブのエラー処理は [integrations/youtube-polling.md §15](./integrations/youtube-polling.md)、フロントエンドのエラーUIは [ui/common.md](./ui/common.md) を参照。

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
| `QUOTA_EXHAUSTED` | 503 | YouTube API クォータが本日分を超過している |

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

## 3. ロギング方針

### 3.1 ログ出力先

初期構成（Docker）では `console.error` / `console.warn` / `console.info` を使用し、標準出力へ出す（Docker logs で参照可能）。AWS移行後は CloudWatch Logs に集約する。

### 3.2 ログレベルの使い分け

| レベル | 用途 | 例 |
|---|---|---|
| `error` | 処理の失敗・例外 | YouTube API エラー、ジョブ失敗、トークン更新失敗 |
| `warn` | 業務上の警告 | クォータ枯渇、個別チャンネルのスキップ |
| `info` | 主要な処理の開始・完了 | ポーリング開始/完了、チャンネル同期完了 |

### 3.3 ログのフォーマット

構造化ログ（JSON形式）を推奨するが、初期実装ではプレーンテキストで可。含めるべき情報：

```
[level] [timestamp] [context] message { structured data }

例:
[error] 2026-03-03T10:00:00Z [polling] YouTube API quota exceeded { quotaExceeded: true, channelCount: 100 }
[warn]  2026-03-03T10:01:00Z [polling] Channel skipped due to API error { channelId: "UC...", error: "404" }
[info]  2026-03-03T10:02:00Z [polling] Polling completed { channelCount: 100, newContents: 3, elapsed: "12.3s" }
```
