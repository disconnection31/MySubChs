# YouTube Data API v3 リファレンス

このプロジェクトで利用する YouTube Data API v3 の制限・仕様をまとめたドキュメント。

---

## 1. クォータ制限

### 基本仕様

| 項目 | 値 |
|---|---|
| 1日の上限 | **10,000 units / 日** |
| 管理単位 | GCP プロジェクト単位（APIキーが複数あっても共有） |
| クォータリセット | 太平洋時間 深夜0時（JST 16:00〜17:00）|
| 超過時のエラー | HTTP 403 `quotaExceeded` |

> **注意**: クォータは開発者の GCP プロジェクト単位で管理される。OAuth 認証ユーザーが何人いても、すべて同一プロジェクトのクォータを消費する。

### クォータリセット時刻（日本時間）

| 期間 | リセット時刻（JST） |
|---|---|
| 夏時間（3月〜11月） | 毎日 16:00 |
| 冬時間（11月〜3月） | 毎日 17:00 |

### クォータ使用量の確認方法

Google Cloud Console で当日のクォータ消費実績を確認できる。

1. [Google Cloud Console](https://console.cloud.google.com/) にログイン
2. **APIとサービス** → **有効なAPI** → **YouTube Data API v3** → **割り当て** タブを開く

本プロジェクトの直リンク:
- https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas?project=mysubchs

> **注意**: 使用量の反映には数分程度の遅延がある。リアルタイムの値ではない。

---

## 2. エンドポイント別コスト

### 読み取り系（list）

| エンドポイント | コスト | 1日の最大呼び出し回数 |
|---|---|---|
| `playlistItems.list` | **1 unit / call** | 10,000 回 |
| `videos.list` | **1 unit / call** | 10,000 回 |
| `channels.list` | **1 unit / call** | 10,000 回 |
| `subscriptions.list` | **1 unit / call** | 10,000 回 |
| `playlists.list` | **1 unit / call** | 10,000 回 |
| `search.list` | **100 units / call** | 100 回 |

### 書き込み系（参考）

| エンドポイント | コスト |
|---|---|
| `playlistItems.insert` | 50 units |
| `videos.insert`（アップロード） | 100 units |

> **重要**: `search.list` は他の list 系と比べて **100倍のコスト**。このプロジェクトでは使用しない。

---

## 3. `maxResults` パラメータとクォータの関係

**`maxResults` を変えてもクォータコストは変わらない。**

| 設定 | 取得件数 | コスト |
|---|---|---|
| `maxResults=5`（デフォルト） | 最大 5 件 | 1 unit |
| `maxResults=10` | 最大 10 件 | 1 unit |
| `maxResults=50`（最大値） | 最大 50 件 | 1 unit |

→ 常に `maxResults=50` を指定することで、同じコストで最大限のデータを取得できる。

**ページネーション**は1ページ取得するごとに 1 unit 追加で消費する。

---

## 4. 各エンドポイントの制約

### `playlistItems.list`
- `maxResults` の最大値: **50**
- アップロードプレイリスト（`uploadsPlaylistId`）経由でチャンネルの投稿動画一覧を取得する唯一の低コスト手段
- コスト: 1 unit / call（件数・ページ数に依存しない）

### `videos.list`
- `maxResults` の最大値: **50**
- 1回のリクエストで最大50件のビデオIDをバッチ処理可能
- `snippet`・`liveStreamingDetails`・`contentDetails` などのパートを組み合わせて取得できる
- コスト: 1 unit / call（50件まで。パート数に関わらずコストは同一）

#### `contentDetails` パートのフィールド詳細（本プロジェクトで使用するもの）

| フィールド | 説明 | 用途 |
|---|---|---|
| `duration` | 動画の長さ（ISO 8601 形式、例: `PT1H2M3S`） | ショート動画判定（≤ 60秒 → `type=SHORT`） |

> **注意**: `contentDetails` パートには他にも `dimension`、`definition`、`caption` 等のフィールドがあるが、本プロジェクトでは `duration` のみを使用する。

#### `liveStreamingDetails` パートのフィールド詳細

| フィールド | 説明 | 取得可能タイミング |
|---|---|---|
| `scheduledStartTime` | 配信予定開始時刻（ISO 8601） | スケジュール設定後、常時取得可能 |
| `scheduledEndTime` | 配信予定終了時刻（ISO 8601） | スケジュール設定後（無限配信の場合は不在） |
| `actualStartTime` | 実際の配信開始時刻（ISO 8601） | **配信開始後〜アーカイブ後も永続的に取得可能** |
| `actualEndTime` | 実際の配信終了時刻（ISO 8601） | **配信終了後〜アーカイブ後も永続的に取得可能** |
| `concurrentViewers` | 同時視聴者数 | 配信中のみ。配信終了後は取得不可 |
| `activeLiveChatId` | ライブチャット ID | 配信中のみ。配信終了後は削除される |

> **重要**: `actualStartTime` と `actualEndTime` は放送終了後（アーカイブ済み）の動画でも引き続き取得できる。`liveStreamingDetails` オブジェクト自体が upcoming・live・completed（アーカイブ済み）のすべての状態で video リソースに含まれるため。リアルタイムデータ（`concurrentViewers`・`activeLiveChatId`）のみ配信終了後に消える。

### `channels.list`
- `maxResults` の最大値: **50**
- `contentDetails.relatedPlaylists.uploads` で `uploadsPlaylistId` を取得できる
- コスト: 1 unit / call（50件まで）

### `subscriptions.list`
- `maxResults` の最大値: **50**
- `mine=true` で認証ユーザーの登録チャンネル一覧を取得できる
- 1,000チャンネル登録している場合: 20 call = 20 units（十分に安価）
- コスト: 1 unit / call（50件まで）

---

## 5. クォータ超過時のエラーレスポンス

```json
{
  "error": {
    "code": 403,
    "message": "The request cannot be completed because you have exceeded your quota.",
    "errors": [
      {
        "domain": "youtube.quota",
        "reason": "quotaExceeded",
        "message": "The request cannot be completed because you have exceeded your quota."
      }
    ]
  }
}
```

クォータリセット（JST 16〜17時）まで全リクエストがこのエラーを返し続ける。

---

## 6. クォータ増加申請

申請自体は可能だが、YouTube API サービス利用規約への準拠審査（Audit）に合格する必要がある。個人用途の非公開アプリでは申請の必要性は低い。

---

## 7. このプロジェクトでの利用方針

| エンドポイント | 利用方針 |
|---|---|
| `search.list` | **使用しない**（100 units/call はコスト過大） |
| `playlistItems.list` | 定期ポーリングの主軸。`maxResults=50` で最新50件取得 |
| `videos.list` | 新着コンテンツの詳細取得（`snippet` + `liveStreamingDetails` + `contentDetails`）+ `status=LIVE` のステータス確認のみ。50件バッチ処理 |
| `channels.list` | `uploadsPlaylistId` の初回取得のみ（以降はDBキャッシュを利用） |
| `subscriptions.list` | チャンネル一覧の手動再同期時のみ |

詳細なクォータ試算・ポーリング設計は [architecture.md §6](./architecture.md) を参照。

---

## 参考URL

- [YouTube Data API v3 概要](https://developers.google.com/youtube/v3/getting-started)
- [クォータの使用量と上限](https://developers.google.com/youtube/v3/getting-started#quota)
- [クォータコスト計算ツール](https://developers.google.com/youtube/v3/determine_quota_cost)
- [playlistItems: list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- [channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- [subscriptions: list](https://developers.google.com/youtube/v3/docs/subscriptions/list)
- [search: list](https://developers.google.com/youtube/v3/docs/search/list)
- [エラーリファレンス](https://developers.google.com/youtube/v3/docs/errors)
- [クォータ増加申請フォーム](https://support.google.com/youtube/contact/yt_api_form)
