import type { Category, NotificationSetting } from '@prisma/client'

import type { CategoryResponse, NotificationSettingResponse } from '@/types/api'

// Prisma's 1:1 relation include returns `T | null`, but notificationSetting
// is always created alongside the category in a transaction, so it is never null at runtime.
export type CategoryWithNotificationSetting = Category & {
  notificationSetting: NotificationSetting
}

/**
 * NotificationSetting を openapi.yaml 準拠のレスポンス形式に変換する。
 * 内部フィールド (id, userId, categoryId, createdAt, updatedAt) を除外し、
 * 公開フィールドのみを返す。
 */
export function formatNotificationSetting(setting: NotificationSetting): NotificationSettingResponse {
  return {
    notifyOnNewVideo: setting.notifyOnNewVideo,
    notifyOnLiveStart: setting.notifyOnLiveStart,
    notifyOnUpcoming: setting.notifyOnUpcoming,
    watchLaterDefault: setting.watchLaterDefault,
    autoExpireHours: setting.autoExpireHours,
    autoPollingEnabled: setting.autoPollingEnabled,
    pollingIntervalMinutes: setting.pollingIntervalMinutes,
  }
}

/**
 * Category + NotificationSetting を openapi.yaml 準拠のレスポンス形式に変換する。
 * notificationSetting -> settings にリネームし、内部フィールドを除外する。
 */
export function formatCategory(category: CategoryWithNotificationSetting): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    settings: formatNotificationSetting(category.notificationSetting),
  }
}
