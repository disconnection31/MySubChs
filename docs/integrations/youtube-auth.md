# YouTube 認証・チャンネル同期仕様

> **スコープ**: Google OAuth 認証フロー、YouTube チャンネル同期処理、BullMQ Worker での OAuth トークン管理を扱う。アプリ全体の技術構成は [architecture.md](../architecture.md)、DB スキーマは [database.md](../database.md) を参照。

## 1. 認証フロー

```
1. ユーザーが「Googleでログイン」ボタンをクリック
2. NextAuth → Google OAuth 2.0 認証
3. コールバック：アクセストークン・リフレッシュトークンをDBに保存
4. セッション確立（JWT）
5. 以降のAPI呼び出しはセッションで認証
6. アクセストークン期限切れ時はリフレッシュトークンで自動更新
```

### 初回ログイン時の即時チャンネル同期

初回ログイン時（`UserSetting` が存在しない場合が「初回」の判断基準。`UserSetting` の初回自動生成については [database.md §4](../database.md) を参照）に、NextAuthのsignInコールバックからBullMQジョブを即時エンキューする。

```
初回ログイン判定フロー:
1. NextAuth signIn コールバックが呼ばれる
2. UserSetting.upsert でデフォルト値を登録（createdAt が今に近いかどうかで初回判定は不可。
   代わりに「UserSetting が存在しない = 初回」として、upsert 前に存在確認を行う）
3. 初回の場合のみ BullMQ に「初回セットアップジョブ」を即時追加（delay: 0）
4. 通常のRepeatable Jobとは別の1回限りのジョブとして実行
```

初回セットアップジョブの処理内容:
1. **チャンネル同期**（§2「チャンネル同期フロー」と同一ロジック）を実行し、YouTubeの登録チャンネルをDBに登録する

> **注**: 初回ログイン時点ではカテゴリが未作成のため、チャンネルはすべて未分類となる。未分類チャンネルは定期ポーリング対象外であるため、コンテンツの取得はユーザーがカテゴリを作成しチャンネルを割り当てた後の定期ポーリングで行われる。

> **注**: 2回目以降のログインでは即時ジョブをエンキューしない。DBにはすでにチャンネルが存在するため、通常の Repeatable Job によるポーリングで最新状態に追従する。

---

## 2. チャンネル同期フロー

初回セットアップジョブおよび手動再同期（`POST /api/settings/sync-channels`）で共通して使用する処理。

```
1. subscriptions.list（YouTube Data API v3）で現在の登録チャンネルを全件取得（50件/ページ・全ページ取得）
2. channels.list でチャンネルのメタデータ（名前・アイコンURL・uploadsPlaylistId）をバッチ取得（最大50件/call）
3. DBに存在しないチャンネル → 新規登録（isActive=true）
4. DBに存在し isActive=false のチャンネル → YouTubeでまだ登録中なら isActive=true に復元
5. DBに存在し isActive=true のチャンネル → YouTubeで登録解除済みなら isActive=false に更新
6. チャンネル名・アイコンURL・uploadsPlaylistId などのメタデータを最新の状態に更新
```

スコープ：
- `https://www.googleapis.com/auth/youtube.readonly`（登録チャンネルの読み取りのみ）

---

## 3. BullMQ Worker での OAuth トークン更新

BullMQ Worker は NextAuth のセッション層と独立して動作するため、トークン更新を独自に実装する必要がある。

```
Worker の YouTube API 呼び出しフロー:
1. DBの Account.token_error を確認する
   token_error IS NOT NULL の場合 → ポーリングをスキップして即時終了（FAILED ではなく早期 return）
   （再認証されるまで無意味なリフレッシュ試行とエラーログ汚染を防ぐため）
2. DBの Account テーブルから access_token / refresh_token / expires_at を取得
3. expires_at < now() の場合 → Google Token Endpoint に refresh_token でリクエスト
   POST https://oauth2.googleapis.com/token
   { grant_type: "refresh_token", refresh_token: "...", client_id: "...", client_secret: "..." }
4. 成功 → Account.access_token と Account.expires_at を更新し、Account.token_error を NULL にクリアしてジョブを継続
5. 失敗（revoked / invalid_grant 等）→ Account.token_error にエラーコード文字列（例: "invalid_grant"）を書き込み、
   ジョブを即時 FAILED 終了・エラーログ記録
   （リトライ不要。無限リトライを防ぐため BullMQ の attempts は 1 に設定）
```

---

## 4. トークン失効時のユーザー通知フロー

```
トークン失効検知から再認証完了までのフロー:
1. Worker がリフレッシュ失敗を検知
   → Account.token_error = "invalid_grant"（または該当するエラーコード）を書き込む
2. ユーザーが設定画面を開く
   → GET /api/settings のレスポンスに tokenStatus: "error" が含まれる
   → 設定画面のアカウントセクションに「要再認証」バナーと再認証ボタンが表示される
3. ユーザーが「再認証する」ボタンをクリック
   → NextAuth の signIn("google") フローを開始（既存の Google OAuth フローを再利用）
4. 再認証成功
   → NextAuth の signIn コールバックで Account.token_error を NULL にリセットする
5. 設定画面の tokenStatus が "valid" に戻り、バナーが非表示になる
```

トークン失効の主な原因：
- ユーザーが Google アカウントの「サードパーティアプリのアクセス」からアプリのアクセス権を削除した場合
- リフレッシュトークンが期限切れになった場合（テスト用 OAuth クライアントは7日で失効）
