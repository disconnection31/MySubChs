# UI仕様書 - Service Worker / PWA 設計

> **スコープ**: Service Worker のイベントハンドラ実装、next-pwa 設定、オフライン時の挙動など、PWA に関するフロントエンド実装の詳細を扱う。Web Push 通知のバックエンド処理（ペイロード生成・送信）は [architecture.md §6](../architecture.md) を参照。

PWA は **Web Push 通知の基盤としてのみ使用** する。オフラインキャッシュやランタイムキャッシュは行わない。

## 1. Service Worker ファイル

`worker/index.js` に配置（architecture.md §3 ディレクトリ構成で定義済み）。next-pwa がビルド時にバンドルして `public/worker-*.js` として出力し、生成された Service Worker から自動的に `importScripts()` される。

## 2. `push` イベントハンドラ

サーバーから送信された Web Push 通知を受信し、ブラウザ通知として表示する。

**ペイロード JSON 構造:**

```json
{
  "title": "チャンネル名",
  "body": "新しい動画: 動画タイトル",
  "icon": "https://yt3.ggpht.com/... or /icon-192x192.png",
  "data": {
    "url": "https://www.youtube.com/watch?v=xxx"
  }
}
```

- `title`: 通知のタイトル。architecture.md §6 Step ⑧ の通知フォーマットに従う（チャンネル名、またはまとめ通知の場合は `MySubChs`）
- `body`: 通知の本文。architecture.md §6 Step ⑧ の通知フォーマットに従う
- `icon`: チャンネルアイコン URL。NULL の場合はアプリアイコン（`/icon-192x192.png`）
- `data.url`: 通知クリック時の遷移先 URL。architecture.md §6 Step ⑧ の通知フォーマットに従う（動画ページまたはダッシュボード `/`）

**処理:**

```javascript
self.addEventListener('push', (event) => {
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      data: payload.data,
    })
  );
});
```

## 3. `notificationclick` イベントハンドラ

通知クリック時に適切なページを開く。

**処理フロー:**

1. `notification.data.url` から遷移先 URL を取得
2. `clients.matchAll({ type: 'window' })` で既存ウィンドウを検索
   - 同一オリジンのウィンドウがあれば `client.navigate(url)` + `client.focus()`
   - なければ `clients.openWindow(url)`
3. `notification.close()` で通知を閉じる

```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client) {
          return client.navigate(url).then(() => client.focus());
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

## 4. `pushsubscriptionchange` イベントハンドラ

ブラウザが自動的にサブスクリプションを更新した場合に発火する。新しいサブスクリプション情報をサーバーに再登録する。

**処理フロー:**

1. `event.newSubscription` から新しいサブスクリプション情報を取得。`undefined` の場合は `registration.pushManager.getSubscription()` にフォールバック（ブラウザ互換性のため）
2. `POST /api/notifications/subscriptions` で再登録（`fetch` で直接呼び出し）
3. リクエストボディは openapi.yaml の `createPushSubscription` と同一フォーマット（`endpoint`, `p256dh`, `auth`）
4. `p256dh` / `auth` は **Base64url** エンコード（openapi.yaml の定義に従う）。`+`→`-`、`/`→`_`、末尾 `=` を除去する
5. 失敗時はログ出力のみ（次回アプリ起動時に設定画面で再登録を促す）

```javascript
function toBase64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.resolve(event.newSubscription || self.registration.pushManager.getSubscription())
      .then((newSub) => {
        if (!newSub) return;

        const key = newSub.getKey('p256dh');
        const auth = newSub.getKey('auth');

        return fetch('/api/notifications/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            p256dh: toBase64url(key),
            auth: toBase64url(auth),
          }),
        });
      })
      .catch((err) => {
        console.error('Failed to re-register push subscription:', err);
      })
  );
});
```

## 5. next-pwa 設定方針

next-pwa は **Service Worker の登録・管理のみ** に使用する。ランタイムキャッシュは無効化する。

| 設定項目 | 値 | 理由 |
|---|---|---|
| `dest` | `"public"` | ビルド成果物を `public/` に出力 |
| `register` | `true` | アプリ起動時に Service Worker を自動登録 |
| `skipWaiting` | `true` | 新しい Service Worker を即時有効化 |
| `runtimeCaching` | `[]`（空配列） | ランタイムキャッシュを無効化（PWA は通知基盤としてのみ使用） |
| `customWorkerSrc` | 省略（デフォルト `"worker"`） | `worker/index.js` をバンドルして Service Worker に組み込む（デフォルトのディレクトリ名なので設定不要） |

## 6. オフライン時の挙動

- オフラインキャッシュは行わない
- ネットワーク接続がない場合はブラウザデフォルトのオフラインエラーを表示
- PWA インストール（ホーム画面追加）は可能だが、オフライン利用は非対応
