export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'INTERNAL_ERROR'
  | 'BAD_REQUEST'

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
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
