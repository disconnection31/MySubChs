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

// 手動ポーリングのクールダウン（秒）
export const MANUAL_POLLING_COOLDOWN_SECONDS = 300

// ポーリング間隔の有効値リスト（分）
export const VALID_POLLING_INTERVALS = [5, 10, 30, 60] as const

// カテゴリ名の最大文字数
export const CATEGORY_NAME_MAX_LENGTH = 50
