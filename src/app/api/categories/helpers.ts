import type { Category, NotificationSetting } from '@prisma/client'

export type CategoryWithNotificationSetting = Category & {
  notificationSetting: NotificationSetting | null
}

/**
 * Category + NotificationSetting を openapi.yaml 準拠のレスポンス形式に変換する。
 * notificationSetting -> settings にリネームし、内部フィールドを除外する。
 */
export function formatCategory(category: CategoryWithNotificationSetting) {
  const { notificationSetting, userId, ...rest } = category

  return {
    ...rest,
    settings: notificationSetting
      ? {
          notifyOnNewVideo: notificationSetting.notifyOnNewVideo,
          notifyOnLiveStart: notificationSetting.notifyOnLiveStart,
          notifyOnUpcoming: notificationSetting.notifyOnUpcoming,
          watchLaterDefault: notificationSetting.watchLaterDefault,
          autoExpireHours: notificationSetting.autoExpireHours,
          autoPollingEnabled: notificationSetting.autoPollingEnabled,
          pollingIntervalMinutes: notificationSetting.pollingIntervalMinutes,
        }
      : null,
  }
}
