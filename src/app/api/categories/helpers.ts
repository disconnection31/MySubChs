import type { Category, NotificationSetting } from '@prisma/client'

export type CategoryWithNotificationSetting = Category & {
  notificationSetting: NotificationSetting | null
}

/**
 * NotificationSetting を openapi.yaml 準拠のレスポンス形式に変換する。
 * 内部フィールド (id, userId, categoryId, createdAt, updatedAt) を除外し、
 * 公開フィールドのみを返す。
 */
export function formatNotificationSetting(setting: NotificationSetting) {
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
export function formatCategory(category: CategoryWithNotificationSetting) {
  const { notificationSetting, userId, ...rest } = category

  return {
    ...rest,
    settings: notificationSetting ? formatNotificationSetting(notificationSetting) : null,
  }
}
