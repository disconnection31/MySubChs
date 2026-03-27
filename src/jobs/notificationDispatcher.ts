import { prisma } from '@/lib/db'
import {
  NOTIFICATION_MAX_INDIVIDUAL,
  NOTIFICATION_APP_ICON_PATH,
  YOUTUBE_CONTENT_URL_TEMPLATE,
} from '@/lib/config'
import { sendPushNotification } from '@/lib/web-push'
import type { PushPayload } from '@/lib/web-push'
import type { ContentStatus, ContentType } from '@prisma/client'

// ---- Types ----

export type NewContentInfo = {
  platformContentId: string
  channelId: string
  type: ContentType
  status: ContentStatus
  title: string
}

export type LiveTransitionInfo = {
  platformContentId: string
  channelId: string
  title: string
}

export type ChannelInfo = {
  name: string
  iconUrl: string | null
}

export type NotificationSettings = {
  notifyOnNewVideo: boolean
  notifyOnLiveStart: boolean
  notifyOnUpcoming: boolean
}

/** Event kind with priority value (lower = higher priority) */
export type EventKind = 'liveStart' | 'upcoming' | 'newVideo'

const EVENT_PRIORITY: Record<EventKind, number> = {
  liveStart: 0,
  upcoming: 1,
  newVideo: 2,
}

export type NotificationEvent = {
  kind: EventKind
  platformContentId: string
  channelId: string
  title: string
}

export type AggregatedNotification = {
  kind: EventKind
  channelId: string
  items: Array<{ platformContentId: string; title: string }>
}

export type NotificationPayload = PushPayload & {
  priority: number
}

// ---- (b) Build notification events from new contents and live transitions ----

export function buildNotificationEvents(
  newContents: NewContentInfo[],
  liveTransitions: LiveTransitionInfo[],
  settings: NotificationSettings,
): NotificationEvent[] {
  const events: NotificationEvent[] = []

  // New content events
  for (const content of newContents) {
    if (
      content.type === 'VIDEO' &&
      content.status === 'ARCHIVED' &&
      settings.notifyOnNewVideo
    ) {
      events.push({
        kind: 'newVideo',
        platformContentId: content.platformContentId,
        channelId: content.channelId,
        title: content.title,
      })
    } else if (
      content.type === 'LIVE' &&
      content.status === 'LIVE' &&
      settings.notifyOnLiveStart
    ) {
      events.push({
        kind: 'liveStart',
        platformContentId: content.platformContentId,
        channelId: content.channelId,
        title: content.title,
      })
    } else if (
      content.type === 'LIVE' &&
      content.status === 'UPCOMING' &&
      settings.notifyOnUpcoming
    ) {
      events.push({
        kind: 'upcoming',
        platformContentId: content.platformContentId,
        channelId: content.channelId,
        title: content.title,
      })
    }
  }

  // UPCOMING → LIVE transitions
  if (settings.notifyOnLiveStart) {
    for (const transition of liveTransitions) {
      events.push({
        kind: 'liveStart',
        platformContentId: transition.platformContentId,
        channelId: transition.channelId,
        title: transition.title,
      })
    }
  }

  return events
}

// ---- (c) Aggregate events by channel + kind ----

export function aggregateEvents(
  events: NotificationEvent[],
): AggregatedNotification[] {
  // Group by channelId + kind
  const groupKey = (e: NotificationEvent) => `${e.channelId}::${e.kind}`
  const groups = new Map<string, NotificationEvent[]>()

  for (const event of events) {
    const key = groupKey(event)
    const group = groups.get(key)
    if (group) {
      group.push(event)
    } else {
      groups.set(key, [event])
    }
  }

  const aggregated: AggregatedNotification[] = []
  groups.forEach((group) => {
    const first = group[0]
    aggregated.push({
      kind: first.kind,
      channelId: first.channelId,
      items: group.map((e: NotificationEvent) => ({
        platformContentId: e.platformContentId,
        title: e.title,
      })),
    })
  })

  return aggregated
}

// ---- (d) Build payloads ----

function kindToBodyPrefix(kind: EventKind, count: number): string {
  if (count > 1) {
    switch (kind) {
      case 'liveStart':
        return `${count}件のライブが開始されました`
      case 'upcoming':
        return `${count}件の配信予定があります`
      case 'newVideo':
        return `新しい動画が${count}件あります`
    }
  }
  switch (kind) {
    case 'liveStart':
      return 'ライブ配信中'
    case 'upcoming':
      return '配信予定'
    case 'newVideo':
      return '新しい動画'
  }
}

export function buildPayloads(
  aggregated: AggregatedNotification[],
  channelMap: Map<string, ChannelInfo>,
): NotificationPayload[] {
  const payloads: NotificationPayload[] = []

  for (const notification of aggregated) {
    const channel = channelMap.get(notification.channelId)
    const channelName = channel?.name ?? 'Unknown Channel'
    const iconUrl = channel?.iconUrl ?? NOTIFICATION_APP_ICON_PATH

    if (notification.items.length === 1) {
      // Individual notification
      const item = notification.items[0]
      const prefix = kindToBodyPrefix(notification.kind, 1)
      payloads.push({
        title: channelName,
        body: `${prefix}: ${item.title}`,
        icon: iconUrl,
        data: { url: `${YOUTUBE_CONTENT_URL_TEMPLATE}${item.platformContentId}` },
        priority: EVENT_PRIORITY[notification.kind],
      })
    } else {
      // Aggregated notification
      const body = kindToBodyPrefix(notification.kind, notification.items.length)
      payloads.push({
        title: channelName,
        body,
        icon: iconUrl,
        data: { url: '/' },
        priority: EVENT_PRIORITY[notification.kind],
      })
    }
  }

  return payloads
}

// ---- (e) Apply priority sorting and limit ----

export function applyPriorityAndLimit(
  payloads: NotificationPayload[],
): PushPayload[] {
  // Sort by priority (lower = higher priority)
  const sorted = [...payloads].sort((a, b) => a.priority - b.priority)

  if (sorted.length <= NOTIFICATION_MAX_INDIVIDUAL) {
    // Strip priority field for final payloads
    return sorted.map(({ priority: _priority, ...rest }) => rest)
  }

  const individual = sorted.slice(0, NOTIFICATION_MAX_INDIVIDUAL)
  const remainingCount = sorted.length - NOTIFICATION_MAX_INDIVIDUAL

  const result: PushPayload[] = individual.map(({ priority: _priority, ...rest }) => rest)

  // Add summary notification
  result.push({
    title: 'MySubChs',
    body: `他${remainingCount}件の新着があります`,
    icon: NOTIFICATION_APP_ICON_PATH,
    data: { url: '/' },
  })

  return result
}

// ---- (f) Send to all subscriptions ----

async function sendToAllSubscriptions(
  userId: string,
  payloads: PushPayload[],
): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) return

  const subscriptionsToDelete: string[] = []

  for (const sub of subscriptions) {
    const pushSubData = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }

    for (const payload of payloads) {
      try {
        const success = await sendPushNotification(pushSubData, payload)
        if (!success) {
          // Subscription gone (410/404) — mark for deletion
          subscriptionsToDelete.push(sub.id)
          break // No need to send more to a dead subscription
        }
      } catch (err) {
        console.error(`[notification] Failed to send push to ${sub.endpoint}: ${err}`)
        // Continue with next payload for this subscription
      }
    }
  }

  // Delete gone subscriptions
  if (subscriptionsToDelete.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: subscriptionsToDelete } },
    })
    console.info(
      `[notification] Deleted ${subscriptionsToDelete.length} gone subscription(s)`,
    )
  }
}

// ---- (a) Main entry point ----

export async function dispatchNotifications(params: {
  categoryId: string
  newContents: NewContentInfo[]
  liveTransitions: LiveTransitionInfo[]
  channelMap: Map<string, ChannelInfo>
}): Promise<void> {
  const { categoryId, newContents, liveTransitions, channelMap } = params

  // 1. Get notification settings for this category
  const notificationSetting = await prisma.notificationSetting.findUnique({
    where: { categoryId },
  })

  if (!notificationSetting) {
    console.warn(`[notification] No notification settings for category ${categoryId}`)
    return
  }

  const settings: NotificationSettings = {
    notifyOnNewVideo: notificationSetting.notifyOnNewVideo,
    notifyOnLiveStart: notificationSetting.notifyOnLiveStart,
    notifyOnUpcoming: notificationSetting.notifyOnUpcoming,
  }

  // 2. Build notification events
  const events = buildNotificationEvents(newContents, liveTransitions, settings)

  if (events.length === 0) return

  // 3. Aggregate by channel + kind
  const aggregated = aggregateEvents(events)

  // 4. Build payloads
  const payloadsWithPriority = buildPayloads(aggregated, channelMap)

  // 5. Apply priority and limit
  const finalPayloads = applyPriorityAndLimit(payloadsWithPriority)

  if (finalPayloads.length === 0) return

  // 6. Send to all subscriptions
  await sendToAllSubscriptions(notificationSetting.userId, finalPayloads)

  console.info(
    `[notification] Dispatched ${finalPayloads.length} notification(s) for category ${categoryId}`,
  )
}
