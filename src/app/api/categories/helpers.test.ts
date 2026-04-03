import { describe, it, expect } from 'vitest'
import type { Category, NotificationSetting } from '@prisma/client'
import { formatNotificationSetting, formatCategory } from './helpers'

function makeNotificationSetting(overrides: Partial<NotificationSetting> = {}): NotificationSetting {
  return {
    id: 'ns-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    notifyOnNewVideo: true,
    notifyOnLiveStart: true,
    notifyOnUpcoming: false,
    watchLaterDefault: false,
    autoExpireHours: null,
    autoPollingEnabled: true,
    pollingIntervalMinutes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    userId: 'user-1',
    name: 'テストカテゴリ',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('formatNotificationSetting', () => {
  it('全フィールドをレスポンス形式に変換する', () => {
    const setting = makeNotificationSetting()
    const result = formatNotificationSetting(setting)

    expect(result).toEqual({
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: false,
      watchLaterDefault: false,
      autoExpireHours: null,
      autoPollingEnabled: true,
      pollingIntervalMinutes: null,
    })
  })

  it('内部フィールド（id, userId, categoryId, createdAt, updatedAt）を含まない', () => {
    const setting = makeNotificationSetting()
    const result = formatNotificationSetting(setting)

    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('categoryId')
    expect(result).not.toHaveProperty('createdAt')
    expect(result).not.toHaveProperty('updatedAt')
  })
})

describe('formatCategory', () => {
  it('NotificationSetting付きのCategoryをレスポンス形式に変換する', () => {
    const category = {
      ...makeCategory(),
      notificationSetting: makeNotificationSetting(),
    }
    const result = formatCategory(category)

    expect(result).toEqual({
      id: 'cat-1',
      name: 'テストカテゴリ',
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: {
        notifyOnNewVideo: true,
        notifyOnLiveStart: true,
        notifyOnUpcoming: false,
        watchLaterDefault: false,
        autoExpireHours: null,
        autoPollingEnabled: true,
        pollingIntervalMinutes: null,
      },
    })
  })

  it('DateフィールドをISO文字列に変換する', () => {
    const category = {
      ...makeCategory({
        createdAt: new Date('2026-06-15T10:30:00.000Z'),
        updatedAt: new Date('2026-06-16T14:45:00.000Z'),
      }),
      notificationSetting: makeNotificationSetting(),
    }
    const result = formatCategory(category)

    expect(result.createdAt).toBe('2026-06-15T10:30:00.000Z')
    expect(result.updatedAt).toBe('2026-06-16T14:45:00.000Z')
  })

  it('userIdフィールドを含まない', () => {
    const category = {
      ...makeCategory(),
      notificationSetting: makeNotificationSetting(),
    }
    const result = formatCategory(category)

    expect(result).not.toHaveProperty('userId')
  })

  it('notificationSettingをsettingsにリネームする', () => {
    const category = {
      ...makeCategory(),
      notificationSetting: makeNotificationSetting(),
    }
    const result = formatCategory(category)

    expect(result).toHaveProperty('settings')
    expect(result).not.toHaveProperty('notificationSetting')
  })

})
