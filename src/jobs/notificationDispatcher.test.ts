import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import {
  buildNotificationEvents,
  aggregateEvents,
  buildPayloads,
  applyPriorityAndLimit,
  dispatchNotifications,
} from './notificationDispatcher'
import type {
  NewContentInfo,
  LiveTransitionInfo,
  ChannelInfo,
  NotificationSettings,
  NotificationEvent,
  AggregatedNotification,
  NotificationPayload,
} from './notificationDispatcher'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

vi.mock('@/lib/web-push', () => ({
  sendPushNotification: vi.fn(),
}))

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

async function getSendPushMock() {
  const mod = await import('@/lib/web-push')
  return mod.sendPushNotification as ReturnType<typeof vi.fn>
}

// ---- Helpers ----

function makeChannelMap(entries: Array<[string, ChannelInfo]>): Map<string, ChannelInfo> {
  return new Map(entries)
}

const defaultSettings: NotificationSettings = {
  notifyOnNewVideo: true,
  notifyOnLiveStart: true,
  notifyOnUpcoming: true,
}

// ---- Tests: buildNotificationEvents ----

describe('buildNotificationEvents', () => {
  it('VIDEO/ARCHIVED → newVideo when notifyOnNewVideo is true', () => {
    const contents: NewContentInfo[] = [
      { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'Video 1' },
    ]
    const result = buildNotificationEvents(contents, [], defaultSettings)
    expect(result).toEqual([
      { kind: 'newVideo', platformContentId: 'v1', channelId: 'ch1', title: 'Video 1' },
    ])
  })

  it('LIVE/LIVE → liveStart when notifyOnLiveStart is true', () => {
    const contents: NewContentInfo[] = [
      { platformContentId: 'v2', channelId: 'ch1', type: 'LIVE', status: 'LIVE', title: 'Live 1' },
    ]
    const result = buildNotificationEvents(contents, [], defaultSettings)
    expect(result).toEqual([
      { kind: 'liveStart', platformContentId: 'v2', channelId: 'ch1', title: 'Live 1' },
    ])
  })

  it('LIVE/UPCOMING → upcoming when notifyOnUpcoming is true', () => {
    const contents: NewContentInfo[] = [
      { platformContentId: 'v3', channelId: 'ch1', type: 'LIVE', status: 'UPCOMING', title: 'Upcoming 1' },
    ]
    const result = buildNotificationEvents(contents, [], defaultSettings)
    expect(result).toEqual([
      { kind: 'upcoming', platformContentId: 'v3', channelId: 'ch1', title: 'Upcoming 1' },
    ])
  })

  it('UPCOMING→LIVE transitions generate liveStart events', () => {
    const transitions: LiveTransitionInfo[] = [
      { platformContentId: 'v4', channelId: 'ch1', title: 'Transitioned Live' },
    ]
    const result = buildNotificationEvents([], transitions, defaultSettings)
    expect(result).toEqual([
      { kind: 'liveStart', platformContentId: 'v4', channelId: 'ch1', title: 'Transitioned Live' },
    ])
  })

  it('filters out events when settings are disabled', () => {
    const contents: NewContentInfo[] = [
      { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'Video' },
      { platformContentId: 'v2', channelId: 'ch1', type: 'LIVE', status: 'LIVE', title: 'Live' },
      { platformContentId: 'v3', channelId: 'ch1', type: 'LIVE', status: 'UPCOMING', title: 'Upcoming' },
    ]
    const transitions: LiveTransitionInfo[] = [
      { platformContentId: 'v4', channelId: 'ch1', title: 'Transition' },
    ]
    const settings: NotificationSettings = {
      notifyOnNewVideo: false,
      notifyOnLiveStart: false,
      notifyOnUpcoming: false,
    }
    const result = buildNotificationEvents(contents, transitions, settings)
    expect(result).toEqual([])
  })

  it('does not generate events for VIDEO/LIVE combination', () => {
    // VIDEO type with LIVE status should not happen, but ensure no events
    const contents: NewContentInfo[] = [
      { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'LIVE', title: 'Invalid' },
    ]
    const result = buildNotificationEvents(contents, [], defaultSettings)
    expect(result).toEqual([])
  })
})

// ---- Tests: aggregateEvents ----

describe('aggregateEvents', () => {
  it('returns individual events when no grouping needed', () => {
    const events: NotificationEvent[] = [
      { kind: 'newVideo', platformContentId: 'v1', channelId: 'ch1', title: 'Video 1' },
    ]
    const result = aggregateEvents(events)
    expect(result).toHaveLength(1)
    expect(result[0].items).toHaveLength(1)
    expect(result[0].kind).toBe('newVideo')
    expect(result[0].channelId).toBe('ch1')
  })

  it('groups multiple events of the same channel+kind', () => {
    const events: NotificationEvent[] = [
      { kind: 'newVideo', platformContentId: 'v1', channelId: 'ch1', title: 'Video 1' },
      { kind: 'newVideo', platformContentId: 'v2', channelId: 'ch1', title: 'Video 2' },
    ]
    const result = aggregateEvents(events)
    expect(result).toHaveLength(1)
    expect(result[0].items).toHaveLength(2)
  })

  it('keeps different kinds separate even for the same channel', () => {
    const events: NotificationEvent[] = [
      { kind: 'newVideo', platformContentId: 'v1', channelId: 'ch1', title: 'Video 1' },
      { kind: 'liveStart', platformContentId: 'v2', channelId: 'ch1', title: 'Live 1' },
    ]
    const result = aggregateEvents(events)
    expect(result).toHaveLength(2)
  })

  it('keeps different channels separate', () => {
    const events: NotificationEvent[] = [
      { kind: 'newVideo', platformContentId: 'v1', channelId: 'ch1', title: 'Video 1' },
      { kind: 'newVideo', platformContentId: 'v2', channelId: 'ch2', title: 'Video 2' },
    ]
    const result = aggregateEvents(events)
    expect(result).toHaveLength(2)
  })
})

// ---- Tests: buildPayloads ----

describe('buildPayloads', () => {
  const channelMap = makeChannelMap([
    ['ch1', { name: 'Channel 1', iconUrl: 'https://example.com/icon1.png' }],
    ['ch2', { name: 'Channel 2', iconUrl: null }],
  ])

  it('builds individual notification payload for single item', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'newVideo',
        channelId: 'ch1',
        items: [{ platformContentId: 'v1', title: 'New Video Title' }],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Channel 1')
    expect(result[0].body).toBe('新しい動画: New Video Title')
    expect(result[0].icon).toBe('https://example.com/icon1.png')
    expect(result[0].data).toEqual({ url: 'https://www.youtube.com/watch?v=v1' })
    expect(result[0].priority).toBe(2) // newVideo priority
  })

  it('builds aggregated notification payload for multiple items', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'newVideo',
        channelId: 'ch1',
        items: [
          { platformContentId: 'v1', title: 'Video 1' },
          { platformContentId: 'v2', title: 'Video 2' },
          { platformContentId: 'v3', title: 'Video 3' },
        ],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result).toHaveLength(1)
    expect(result[0].body).toBe('新しい動画が3件あります')
    expect(result[0].data).toEqual({ url: '/' })
  })

  it('uses app icon when channel has no iconUrl', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'liveStart',
        channelId: 'ch2',
        items: [{ platformContentId: 'v1', title: 'Live' }],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result[0].icon).toBe('/icon-192x192.png')
  })

  it('uses correct body prefix for liveStart', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'liveStart',
        channelId: 'ch1',
        items: [{ platformContentId: 'v1', title: 'Live Title' }],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result[0].body).toBe('ライブ配信中: Live Title')
    expect(result[0].priority).toBe(0)
  })

  it('uses correct body prefix for upcoming', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'upcoming',
        channelId: 'ch1',
        items: [{ platformContentId: 'v1', title: 'Upcoming Title' }],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result[0].body).toBe('配信予定: Upcoming Title')
    expect(result[0].priority).toBe(1)
  })

  it('uses aggregated body for multiple liveStart', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'liveStart',
        channelId: 'ch1',
        items: [
          { platformContentId: 'v1', title: 'Live 1' },
          { platformContentId: 'v2', title: 'Live 2' },
        ],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result[0].body).toBe('2件のライブが開始されました')
  })

  it('uses "Unknown Channel" when channel not in map', () => {
    const aggregated: AggregatedNotification[] = [
      {
        kind: 'newVideo',
        channelId: 'unknown-ch',
        items: [{ platformContentId: 'v1', title: 'Title' }],
      },
    ]
    const result = buildPayloads(aggregated, channelMap)
    expect(result[0].title).toBe('Unknown Channel')
  })
})

// ---- Tests: applyPriorityAndLimit ----

describe('applyPriorityAndLimit', () => {
  it('returns all payloads when count <= 5', () => {
    const payloads: NotificationPayload[] = [
      { title: 'A', body: 'a', priority: 2 },
      { title: 'B', body: 'b', priority: 0 },
    ]
    const result = applyPriorityAndLimit(payloads)
    expect(result).toHaveLength(2)
    // Should be sorted by priority
    expect(result[0].title).toBe('B') // priority 0
    expect(result[1].title).toBe('A') // priority 2
    // Priority field should be stripped
    expect('priority' in result[0]).toBe(false)
  })

  it('limits to 5 individual + 1 summary when count > 5', () => {
    const payloads: NotificationPayload[] = Array.from({ length: 7 }, (_, i) => ({
      title: `Ch${i}`,
      body: `body${i}`,
      priority: i % 3,
    }))
    const result = applyPriorityAndLimit(payloads)
    expect(result).toHaveLength(6) // 5 individual + 1 summary
    // Last should be summary
    const summary = result[5]
    expect(summary.title).toBe('MySubChs')
    expect(summary.body).toBe('他2件の新着があります')
    expect(summary.icon).toBe('/icon-192x192.png')
    expect(summary.data).toEqual({ url: '/' })
  })

  it('sorts by priority (liveStart first)', () => {
    const payloads: NotificationPayload[] = [
      { title: 'Video', body: 'v', priority: 2 },
      { title: 'Live', body: 'l', priority: 0 },
      { title: 'Upcoming', body: 'u', priority: 1 },
    ]
    const result = applyPriorityAndLimit(payloads)
    expect(result[0].title).toBe('Live')
    expect(result[1].title).toBe('Upcoming')
    expect(result[2].title).toBe('Video')
  })

  it('returns empty array for empty input', () => {
    const result = applyPriorityAndLimit([])
    expect(result).toEqual([])
  })

  it('exactly 5 payloads returns all without summary', () => {
    const payloads: NotificationPayload[] = Array.from({ length: 5 }, (_, i) => ({
      title: `Ch${i}`,
      body: `body${i}`,
      priority: 0,
    }))
    const result = applyPriorityAndLimit(payloads)
    expect(result).toHaveLength(5)
    // No summary
    expect(result.every((p) => p.title !== 'MySubChs')).toBe(true)
  })
})

// ---- Tests: dispatchNotifications (integration with mocked DB/push) ----

describe('dispatchNotifications', () => {
  let prismaMock: MockPrisma
  let sendPushMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    sendPushMock = await getSendPushMock()
    mockReset(prismaMock)
    sendPushMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const channelMap = makeChannelMap([
    ['ch1', { name: 'Channel 1', iconUrl: 'https://example.com/icon.png' }],
  ])

  it('does nothing when notification settings not found', async () => {
    prismaMock.notificationSetting.findUnique.mockResolvedValue(null)

    await dispatchNotifications({
      categoryId: 'cat1',
      newContents: [
        { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'T' },
      ],
      liveTransitions: [],
      channelMap,
    })

    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('does nothing when all notification types are disabled', async () => {
    prismaMock.notificationSetting.findUnique.mockResolvedValue({
      id: 'ns1',
      categoryId: 'cat1',
      userId: 'user1',
      notifyOnNewVideo: false,
      notifyOnLiveStart: false,
      notifyOnUpcoming: false,
      autoPollingEnabled: true,
    } as never)

    await dispatchNotifications({
      categoryId: 'cat1',
      newContents: [
        { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'T' },
      ],
      liveTransitions: [],
      channelMap,
    })

    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('sends push notifications for new video content', async () => {
    prismaMock.notificationSetting.findUnique.mockResolvedValue({
      id: 'ns1',
      categoryId: 'cat1',
      userId: 'user1',
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: true,
      autoPollingEnabled: true,
    } as never)

    prismaMock.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'sub1',
        userId: 'user1',
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
        createdAt: new Date(),
        userAgent: null,
      },
    ])

    sendPushMock.mockResolvedValue(true)

    await dispatchNotifications({
      categoryId: 'cat1',
      newContents: [
        { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'New Video' },
      ],
      liveTransitions: [],
      channelMap,
    })

    expect(sendPushMock).toHaveBeenCalledTimes(1)
    expect(sendPushMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'key1', auth: 'auth1' } },
      expect.objectContaining({
        title: 'Channel 1',
        body: '新しい動画: New Video',
      }),
    )
  })

  it('deletes gone subscriptions (sendPushNotification returns false)', async () => {
    prismaMock.notificationSetting.findUnique.mockResolvedValue({
      id: 'ns1',
      categoryId: 'cat1',
      userId: 'user1',
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: true,
      autoPollingEnabled: true,
    } as never)

    prismaMock.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'sub1',
        userId: 'user1',
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
        createdAt: new Date(),
        userAgent: null,
      },
    ])

    // Subscription gone
    sendPushMock.mockResolvedValue(false)

    await dispatchNotifications({
      categoryId: 'cat1',
      newContents: [
        { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'T' },
      ],
      liveTransitions: [],
      channelMap,
    })

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub1'] } },
    })
  })

  it('does nothing when no subscriptions exist', async () => {
    prismaMock.notificationSetting.findUnique.mockResolvedValue({
      id: 'ns1',
      categoryId: 'cat1',
      userId: 'user1',
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: true,
      autoPollingEnabled: true,
    } as never)

    prismaMock.pushSubscription.findMany.mockResolvedValue([])

    await dispatchNotifications({
      categoryId: 'cat1',
      newContents: [
        { platformContentId: 'v1', channelId: 'ch1', type: 'VIDEO', status: 'ARCHIVED', title: 'T' },
      ],
      liveTransitions: [],
      channelMap,
    })

    expect(sendPushMock).not.toHaveBeenCalled()
  })
})
