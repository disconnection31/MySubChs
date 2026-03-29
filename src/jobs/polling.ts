import { ContentStatus, ContentType } from '@prisma/client'

import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import {
  REDIS_KEY_QUOTA_EXHAUSTED,
  SHORT_DURATION_THRESHOLD_SECONDS,
  YOUTUBE_CONTENT_URL_TEMPLATE,
} from '@/lib/config'
import { youTubeAdapter, YouTubeQuotaExceededError } from '@/lib/platforms/youtube'
import type { VideoDetail } from '@/lib/platforms/base'
import { dispatchNotifications } from '@/jobs/notificationDispatcher'
import type { NewContentInfo, LiveTransitionInfo, ChannelInfo } from '@/jobs/notificationDispatcher'
import { autoAssignWatchLater } from '@/jobs/watchLaterAutoAssign'

// ---- Types ----

type ContentFields = {
  type: ContentType
  status: ContentStatus
  title: string
  publishedAt: Date | null
  scheduledStartAt: Date | null
  actualStartAt: Date | null
  actualEndAt: Date | null
  contentAt: Date
  url?: string
  durationSeconds: number | null
}

type ExistingContent = {
  id: string
  platform: string
  platformContentId: string
  channelId: string
  type: ContentType
  status: ContentStatus
  scheduledStartAt: Date | null
  actualStartAt: Date | null
}

// ---- Helper: Calculate TTL until next UTC midnight ----

export function calculateQuotaExhaustedTTL(): { ttlSeconds: number; expiresAt: string } {
  const now = new Date()
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ))
  const ttlSeconds = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000)
  return { ttlSeconds, expiresAt: tomorrow.toISOString() }
}

// ---- Helper: Determine content fields for new content ----

export function determineNewContentFields(
  detail: VideoDetail,
  channelId: string,
  now: Date,
): ContentFields | null {
  const { liveBroadcastContent, platformContentId } = detail

  if (liveBroadcastContent === 'upcoming') {
    const scheduledStartAt = detail.scheduledStartTime
      ? new Date(detail.scheduledStartTime)
      : now
    return {
      type: ContentType.LIVE,
      status: ContentStatus.UPCOMING,
      title: detail.title,
      publishedAt: detail.publishedAt ? new Date(detail.publishedAt) : null,
      scheduledStartAt,
      actualStartAt: null,
      actualEndAt: null,
      contentAt: scheduledStartAt,
      url: `${YOUTUBE_CONTENT_URL_TEMPLATE}${platformContentId}`,
      durationSeconds: null,
    }
  }

  if (liveBroadcastContent === 'live') {
    const actualStartAt = detail.actualStartTime
      ? new Date(detail.actualStartTime)
      : now
    return {
      type: ContentType.LIVE,
      status: ContentStatus.LIVE,
      title: detail.title,
      publishedAt: detail.publishedAt ? new Date(detail.publishedAt) : null,
      scheduledStartAt: detail.scheduledStartTime
        ? new Date(detail.scheduledStartTime)
        : null,
      actualStartAt,
      actualEndAt: null,
      contentAt: actualStartAt,
      url: `${YOUTUBE_CONTENT_URL_TEMPLATE}${platformContentId}`,
      durationSeconds: null,
    }
  }

  // liveBroadcastContent === 'none' → VIDEO or SHORT / ARCHIVED
  const publishedAt = detail.publishedAt ? new Date(detail.publishedAt) : null
  const isShort = detail.durationSeconds !== null
    && detail.durationSeconds <= SHORT_DURATION_THRESHOLD_SECONDS
  return {
    type: isShort ? ContentType.SHORT : ContentType.VIDEO,
    status: ContentStatus.ARCHIVED,
    title: detail.title,
    publishedAt,
    scheduledStartAt: null,
    actualStartAt: null,
    actualEndAt: null,
    contentAt: publishedAt ?? now,
    url: `${YOUTUBE_CONTENT_URL_TEMPLATE}${platformContentId}`,
    durationSeconds: detail.durationSeconds,
  }
}

// ---- Helper: Determine update fields for existing LIVE content ----

export function determineExistingLiveUpdate(
  detail: VideoDetail | undefined,
  existing: ExistingContent,
): Partial<ContentFields> | null {
  if (!detail) {
    // ID not found in response → CANCELLED
    return { status: ContentStatus.CANCELLED }
  }

  if (detail.liveBroadcastContent === 'none') {
    if (detail.actualEndTime) {
      return {
        status: ContentStatus.ARCHIVED,
        actualEndAt: new Date(detail.actualEndTime),
        title: detail.title,
      }
    }
    // none + no actualEndTime → CANCELLED
    return { status: ContentStatus.CANCELLED, title: detail.title }
  }

  // Still live — update title only
  return { title: detail.title }
}

// ---- Helper: Determine update fields for existing UPCOMING (scheduledStartAt <= now) ----

export function determineExistingUpcomingUpdate(
  detail: VideoDetail | undefined,
  existing: ExistingContent,
): Partial<ContentFields> | null {
  if (!detail) {
    // ID not found → CANCELLED
    return { status: ContentStatus.CANCELLED }
  }

  if (detail.liveBroadcastContent === 'live') {
    const actualStartAt = detail.actualStartTime
      ? new Date(detail.actualStartTime)
      : existing.scheduledStartAt ?? new Date()
    return {
      status: ContentStatus.LIVE,
      actualStartAt,
      contentAt: actualStartAt,
      title: detail.title,
    }
  }

  if (detail.liveBroadcastContent === 'upcoming') {
    // Postponed — update scheduledStartAt
    const scheduledStartAt = detail.scheduledStartTime
      ? new Date(detail.scheduledStartTime)
      : existing.scheduledStartAt
    return {
      scheduledStartAt,
      contentAt: scheduledStartAt ?? undefined,
      title: detail.title,
    }
  }

  // liveBroadcastContent === 'none' → CANCELLED
  return { status: ContentStatus.CANCELLED, title: detail.title }
}

// ---- Main polling logic ----

/**
 * Execute polling for a category.
 * Called by both auto-poll and manual-poll jobs.
 *
 * @param categoryId - The category to poll
 * @param accessToken - Valid YouTube API access token
 * @param isManual - If true, skip autoPollingEnabled check (manual poll)
 */
export async function executePolling(
  categoryId: string,
  accessToken: string,
  isManual: boolean = false,
): Promise<void> {
  const now = new Date()

  // Step 1: Get active channels for this category
  const channels = await prisma.channel.findMany({
    where: {
      categoryId,
      isActive: true,
      ...(isManual
        ? {}
        : {
            category: {
              notificationSetting: { autoPollingEnabled: true },
            },
          }),
    },
  })

  if (channels.length === 0) {
    console.info(`[polling] No active channels for category ${categoryId}`)
    return
  }

  // Step 2: Cache uploadsPlaylistId for channels that don't have it
  const channelsMissingPlaylistId = channels.filter((ch) => !ch.uploadsPlaylistId)
  if (channelsMissingPlaylistId.length > 0) {
    const platformIds = channelsMissingPlaylistId.map((ch) => ch.platformChannelId)
    try {
      const metas = await youTubeAdapter.getChannelMetas(platformIds, accessToken)
      const metaMap = new Map(metas.map((m) => [m.platformChannelId, m]))

      const channelsToUpdate = channelsMissingPlaylistId.filter((ch) => {
        const meta = metaMap.get(ch.platformChannelId)
        if (meta) {
          ch.uploadsPlaylistId = meta.uploadsPlaylistId
          return true
        }
        console.warn(
          `[polling] Could not fetch uploadsPlaylistId for channel ${ch.platformChannelId}`,
        )
        return false
      })

      if (channelsToUpdate.length > 0) {
        await prisma.$transaction(
          channelsToUpdate.map((ch) =>
            prisma.channel.update({
              where: { id: ch.id },
              data: { uploadsPlaylistId: ch.uploadsPlaylistId! },
            }),
          ),
        )
      }
    } catch (err) {
      if (err instanceof YouTubeQuotaExceededError) {
        throw err // Propagate to caller for §13 handling
      }
      console.error(`[polling] Error fetching channel metas: ${err}`)
      // Continue with channels that already have uploadsPlaylistId
    }
  }

  // Steps 3-6: Process each channel
  // Collect all playlist items across channels, then batch process
  const allNewPlatformContentIds: string[] = []
  const channelContentMap = new Map<
    string,
    { channelId: string; platformContentIds: string[] }
  >()
  // Track channels that successfully fetched playlist items (for lastPolledAt update)
  const successfullyPolledChannelIds: string[] = []

  for (const channel of channels) {
    if (!channel.uploadsPlaylistId) {
      console.warn(
        `[polling] Skipping channel ${channel.platformChannelId}: no uploadsPlaylistId`,
      )
      continue
    }

    try {
      // Step 3: Get latest videos from uploads playlist
      // Quota cost: 1 unit per call (playlistItems.list)
      const playlistItems = await youTubeAdapter.getPlaylistItems(
        channel.uploadsPlaylistId,
        accessToken,
      )

      const platformContentIds = playlistItems.map((item) => item.platformContentId)
      channelContentMap.set(channel.id, {
        channelId: channel.id,
        platformContentIds,
      })
      allNewPlatformContentIds.push(...platformContentIds)
      successfullyPolledChannelIds.push(channel.id)
    } catch (err) {
      if (err instanceof YouTubeQuotaExceededError) {
        throw err // §13: Immediate job termination
      }
      // §15: Skip this channel on error, continue with next
      console.error(
        `[polling] Error fetching playlist items for channel ${channel.platformChannelId}: ${err}`,
      )
      continue
    }
  }

  if (allNewPlatformContentIds.length === 0) {
    console.info(`[polling] No content IDs found for category ${categoryId}`)
    return
  }

  // Step 4: Check which content already exists in DB
  const existingContents = await prisma.content.findMany({
    where: {
      platform: 'youtube',
      platformContentId: { in: allNewPlatformContentIds },
    },
    select: {
      id: true,
      platform: true,
      platformContentId: true,
      channelId: true,
      type: true,
      status: true,
      scheduledStartAt: true,
      actualStartAt: true,
    },
  })

  const existingContentMap = new Map(
    existingContents.map((c) => [c.platformContentId, c]),
  )

  // Determine which IDs are new
  const newContentIds = allNewPlatformContentIds.filter(
    (id) => !existingContentMap.has(id),
  )

  // Find existing LIVE and UPCOMING (scheduledStartAt <= now) content for status checks
  const existingLiveContents = existingContents.filter(
    (c) => c.status === ContentStatus.LIVE,
  )
  const existingUpcomingContents = existingContents.filter(
    (c) =>
      c.status === ContentStatus.UPCOMING &&
      c.scheduledStartAt &&
      c.scheduledStartAt <= now,
  )

  // Step 5: Build list of IDs that need videos.list details
  const videosListTargetIds = new Set<string>()
  for (const id of newContentIds) {
    videosListTargetIds.add(id)
  }
  for (const c of existingLiveContents) {
    videosListTargetIds.add(c.platformContentId)
  }
  for (const c of existingUpcomingContents) {
    videosListTargetIds.add(c.platformContentId)
  }

  if (videosListTargetIds.size === 0) {
    console.info(`[polling] No videos.list targets for category ${categoryId}`)
    return
  }

  let videoDetails: VideoDetail[] = []
  try {
    // Quota cost: 1 unit per 50 IDs (videos.list)
    videoDetails = await youTubeAdapter.getVideoDetails(
      Array.from(videosListTargetIds),
      accessToken,
    )
  } catch (err) {
    if (err instanceof YouTubeQuotaExceededError) {
      throw err // §13: Immediate job termination
    }
    console.error(`[polling] Error fetching video details: ${err}`)
    return
  }

  const videoDetailMap = new Map(
    videoDetails.map((v) => [v.platformContentId, v]),
  )

  // Step 6: UPSERT content
  // Build a reverse map: platformContentId → channelId
  const contentToChannelMap = new Map<string, string>()
  channelContentMap.forEach((data, channelId) => {
    for (const pid of data.platformContentIds) {
      if (!contentToChannelMap.has(pid)) {
        contentToChannelMap.set(pid, channelId)
      }
    }
  })

  // Collect all DB operations for batched transaction
  const dbOperations: ReturnType<typeof prisma.content.upsert>[] = []

  // Accumulators for notification dispatch (Step 8)
  const notificationNewContents: NewContentInfo[] = []
  const notificationLiveTransitions: LiveTransitionInfo[] = []

  // Process new content
  for (const platformContentId of newContentIds) {
    const detail = videoDetailMap.get(platformContentId)
    if (!detail) continue

    const channelId = contentToChannelMap.get(platformContentId)
    if (!channelId) continue

    const fields = determineNewContentFields(detail, channelId, now)
    if (!fields) continue

    // Collect for notification dispatch
    notificationNewContents.push({
      platformContentId,
      channelId,
      type: fields.type,
      status: fields.status,
      title: fields.title,
    })

    dbOperations.push(
      prisma.content.upsert({
        where: {
          platform_platformContentId: {
            platform: 'youtube',
            platformContentId,
          },
        },
        create: {
          channelId,
          platform: 'youtube',
          platformContentId,
          title: fields.title,
          type: fields.type,
          status: fields.status,
          publishedAt: fields.publishedAt,
          scheduledStartAt: fields.scheduledStartAt,
          actualStartAt: fields.actualStartAt,
          actualEndAt: fields.actualEndAt,
          contentAt: fields.contentAt,
          url: fields.url!,
          durationSeconds: fields.durationSeconds,
        },
        update: {
          title: fields.title,
          status: fields.status,
          publishedAt: fields.publishedAt,
          scheduledStartAt: fields.scheduledStartAt,
          actualStartAt: fields.actualStartAt,
          actualEndAt: fields.actualEndAt,
          contentAt: fields.contentAt,
        },
      }),
    )
  }

  // Process existing LIVE content
  for (const existing of existingLiveContents) {
    const detail = videoDetailMap.get(existing.platformContentId)
    const updateFields = determineExistingLiveUpdate(detail, existing)
    if (!updateFields) continue

    dbOperations.push(
      prisma.content.update({
        where: { id: existing.id },
        data: updateFields,
      }) as ReturnType<typeof prisma.content.upsert>,
    )
  }

  // Process existing UPCOMING (scheduledStartAt <= now) content
  for (const existing of existingUpcomingContents) {
    const detail = videoDetailMap.get(existing.platformContentId)
    const updateFields = determineExistingUpcomingUpdate(detail, existing)
    if (!updateFields) continue

    // Collect UPCOMING → LIVE transitions for notification dispatch
    if (updateFields.status === ContentStatus.LIVE && detail) {
      notificationLiveTransitions.push({
        platformContentId: existing.platformContentId,
        channelId: existing.channelId,
        title: detail.title,
      })
    }

    dbOperations.push(
      prisma.content.update({
        where: { id: existing.id },
        data: updateFields,
      }) as ReturnType<typeof prisma.content.upsert>,
    )
  }

  // Execute all content operations + lastPolledAt updates in a single transaction
  const polledAtNow = new Date()
  if (dbOperations.length > 0 || successfullyPolledChannelIds.length > 0) {
    await prisma.$transaction([
      ...dbOperations,
      ...(successfullyPolledChannelIds.length > 0
        ? [
            prisma.channel.updateMany({
              where: { id: { in: successfullyPolledChannelIds } },
              data: { lastPolledAt: polledAtNow },
            }),
          ]
        : []),
    ])
  }

  // Step 7: WatchLater auto-assignment
  if (newContentIds.length > 0) {
    try {
      await autoAssignWatchLater(categoryId, newContentIds, now)
    } catch (err) {
      // WatchLater auto-assignment failure must not fail the polling job
      console.error(`[polling] WatchLater auto-assignment failed for category ${categoryId}: ${err}`)
    }
  }

  // Step 8: Push notification dispatch
  if (notificationNewContents.length > 0 || notificationLiveTransitions.length > 0) {
    try {
      // Build channel map for notification payloads
      const notificationChannelMap = new Map<string, ChannelInfo>()
      for (const channel of channels) {
        notificationChannelMap.set(channel.id, {
          name: channel.name,
          iconUrl: channel.iconUrl,
        })
      }

      await dispatchNotifications({
        categoryId,
        newContents: notificationNewContents,
        liveTransitions: notificationLiveTransitions,
        channelMap: notificationChannelMap,
      })
    } catch (err) {
      // Notification failure must not fail the polling job
      console.error(`[polling] Notification dispatch failed for category ${categoryId}: ${err}`)
    }
  }

  console.info(
    `[polling] Polling completed for category ${categoryId}: ${newContentIds.length} new, ${existingLiveContents.length} live checked, ${existingUpcomingContents.length} upcoming checked`,
  )
}

// ---- Quota exhaustion handler ----

export async function setQuotaExhausted(): Promise<void> {
  const { ttlSeconds, expiresAt } = calculateQuotaExhaustedTTL()
  await redis.set(REDIS_KEY_QUOTA_EXHAUSTED, expiresAt, 'EX', ttlSeconds)
  console.warn(
    `[polling] YouTube API quota exhausted. Polling suspended until UTC midnight. (${expiresAt})`,
  )
}

