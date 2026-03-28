// UIプレビューモード（開発環境専用）
export const DEV_USER_ID = '00000000-0000-4000-a000-000000000001'
export const DEV_USER_EMAIL = 'dev@example.com'
export const DEV_USER_NAME = 'Dev User'
export const DEV_USER_IMAGE = '/images/placeholder-avatar.svg'

export function isDevBypassAuth(): boolean {
  return process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production'
}

// UserSetting のデフォルト値
export const DEFAULT_POLLING_INTERVAL_MINUTES = 30
export const DEFAULT_CONTENT_RETENTION_DAYS = 60

// YouTube Data API v3 クォータ
// ref: ref/youtube-api.md
export const YOUTUBE_QUOTA_DAILY_LIMIT = 10_000
export const YOUTUBE_QUOTA_WARNING_THRESHOLD = 9_000

// YouTube API エンドポイント別クォータコスト
export const YOUTUBE_QUOTA_COST_PLAYLIST_ITEMS = 1
export const YOUTUBE_QUOTA_COST_VIDEOS = 1
export const YOUTUBE_QUOTA_COST_CHANNELS = 1
export const YOUTUBE_QUOTA_COST_SUBSCRIPTIONS = 1
// search.list は使用禁止（コスト過多）。定数として記録のみ。
export const YOUTUBE_QUOTA_COST_SEARCH = 100

// playlistItems.list の maxResults 最大値
export const YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS = 50

// videos.list の maxResults 最大値（1 call あたり最大 50 件バッチ処理）
export const YOUTUBE_VIDEOS_MAX_RESULTS = 50

// channels.list の maxResults 最大値（1 call あたり最大 50 件バッチ処理）
export const YOUTUBE_CHANNELS_MAX_RESULTS = 50

// subscriptions.list の maxResults 最大値
export const YOUTUBE_SUBSCRIPTIONS_MAX_RESULTS = 50

// 手動ポーリングのクールダウン（秒）
export const MANUAL_POLLING_COOLDOWN_SECONDS = 300

// ポーリング間隔の有効値リスト（分）
export const VALID_POLLING_INTERVALS = [5, 10, 30, 60] as const

// カテゴリ名の最大文字数
export const CATEGORY_NAME_MAX_LENGTH = 50

// WatchLater 自動失効時間の有効値リスト（時間）
// UI: 1日=24h, 3日=72h, 1週間=168h, 2週間=336h
export const VALID_AUTO_EXPIRE_HOURS = [24, 72, 168, 336] as const

// コンテンツ保持期間の有効値リスト（日）
export const VALID_CONTENT_RETENTION_DAYS = [30, 60, 90, 180, 365] as const

// videos.list の1ポーリングサイクルあたりの概算コスト（youtube-polling.md §11）
export const ESTIMATED_QUOTA_OVERHEAD_PER_POLL = 2

// コンテンツ一覧ページネーション
export const DEFAULT_CONTENTS_LIMIT = 20
export const MAX_CONTENTS_LIMIT = 50

// ContentCleanup ジョブ
export const CONTENT_CLEANUP_CRON = '0 18 * * *' // JST 03:00 = UTC 18:00
export const CONTENT_CLEANUP_JOB_NAME = 'content-cleanup'

// WatchLaterCleanup ジョブ
export const WATCHLATER_CLEANUP_CRON = '0 19 * * *' // JST 04:00 = UTC 19:00
export const WATCHLATER_CLEANUP_JOB_NAME = 'watchlater-cleanup'

// 初回セットアップジョブ
export const SETUP_JOB_NAME = 'setup'

// BullMQ ジョブ名プレフィックス
export const AUTO_POLL_JOB_PREFIX = 'auto-poll:'

// Redis キー名
export const REDIS_KEY_QUOTA_EXHAUSTED = 'quota:exhausted'
export const REDIS_KEY_POLLING_LOCK_PREFIX = 'polling:lock:'
export const REDIS_KEY_MANUAL_POLL_COOLDOWN_PREFIX = 'manual-poll:cooldown:'

// YouTube コンテンツ URL テンプレート
export const YOUTUBE_CONTENT_URL_TEMPLATE = 'https://www.youtube.com/watch?v='

// ダッシュボード: 未分類カテゴリの仮想ID
export const UNCATEGORIZED_CATEGORY_ID = 'uncategorized'

// 初回ログイン時のチャンネル取得ポーリング間隔（ミリ秒）
export const INITIAL_LOADING_POLL_INTERVAL_MS = 5_000

// 通知
export const NOTIFICATION_APP_NAME = 'MySubChs'
export const NOTIFICATION_MAX_INDIVIDUAL = 5
export const NOTIFICATION_APP_ICON_PATH = '/icon-192x192.png'
