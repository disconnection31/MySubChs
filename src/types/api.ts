export type ApiErrorBody = {
  error: {
    code: string
    message: string
    retryAfter?: number
  }
}

export class ApiError extends Error {
  public readonly retryAfter?: number

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.retryAfter = retryAfter
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401
}

// --- Category ---

export type NotificationSettingResponse = {
  notifyOnNewVideo: boolean
  notifyOnLiveStart: boolean
  notifyOnUpcoming: boolean
  watchLaterDefault: boolean
  autoExpireHours: number | null
  autoPollingEnabled: boolean
  pollingIntervalMinutes: number | null
}

export type CategoryResponse = {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  settings: NotificationSettingResponse | null
}

// --- Channel ---

export type ChannelResponse = {
  id: string
  platform: string
  platformChannelId: string
  name: string
  iconUrl: string | null
  categoryId: string | null
  isActive: boolean
  lastPolledAt: string | null
  createdAt: string
  updatedAt: string
}

// --- Content ---

export type ContentChannelResponse = {
  name: string
  iconUrl: string | null
}

export type WatchLaterResponse = {
  addedVia: 'MANUAL' | 'AUTO'
  expiresAt: string | null
  addedAt: string
}

export type ContentResponse = {
  id: string
  channelId: string
  platform: string
  platformContentId: string
  title: string
  type: 'VIDEO' | 'LIVE'
  status: 'UPCOMING' | 'LIVE' | 'ARCHIVED' | 'CANCELLED'
  contentAt: string
  publishedAt: string | null
  scheduledStartAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  url: string
  channel: ContentChannelResponse
  watchLater: WatchLaterResponse | null
  createdAt: string
  updatedAt: string
}

export type PaginationMeta = {
  hasNext: boolean
  nextCursor: string | null
}

export type PaginatedResponse<T> = {
  data: T[]
  meta: PaginationMeta
}

// --- Manual Polling ---

export type PollTriggerResponse = {
  queued: boolean
}

export type PollStatusResponse = {
  status: 'none' | 'waiting' | 'active' | 'completed' | 'failed'
  cooldownRemaining: number
}

// --- UserSettings (GET /api/settings) ---

export type UserSettingsResponse = {
  pollingIntervalMinutes: number
  contentRetentionDays: number
  estimatedDailyQuota: number
  quotaWarningThreshold: number
  quotaDailyLimit: number
  tokenStatus: 'valid' | 'error'
  quotaExhaustedUntil: string | null
}
