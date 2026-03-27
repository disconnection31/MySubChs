import { WatchLaterSource } from '@prisma/client'

import { prisma } from '@/lib/db'

/**
 * Auto-assign WatchLater records for new content during polling (Step 7).
 *
 * When a category's NotificationSetting has watchLaterDefault=true,
 * new content from that category's channels gets a WatchLater record
 * with addedVia=AUTO and optional expiresAt based on autoExpireHours.
 *
 * Records with removedVia IS NOT NULL are never re-added (user explicitly removed).
 */
export async function autoAssignWatchLater(
  categoryId: string,
  newContentPlatformIds: string[],
  now: Date,
): Promise<void> {
  if (newContentPlatformIds.length === 0) {
    return
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: {
      userId: true,
      notificationSetting: {
        select: {
          watchLaterDefault: true,
          autoExpireHours: true,
        },
      },
    },
  })

  if (!category || !category.notificationSetting?.watchLaterDefault) {
    return
  }

  const { userId } = category
  const { autoExpireHours } = category.notificationSetting

  const expiresAt = autoExpireHours
    ? new Date(now.getTime() + autoExpireHours * 60 * 60 * 1000)
    : null

  const contents = await prisma.content.findMany({
    where: {
      platform: 'youtube',
      platformContentId: { in: newContentPlatformIds },
    },
    select: { id: true },
  })

  if (contents.length === 0) {
    return
  }

  const contentIds = contents.map((c) => c.id)

  // Single query: fetch all existing WatchLater records for these contentIds
  const existingWatchLaters = await prisma.watchLater.findMany({
    where: {
      userId,
      contentId: { in: contentIds },
    },
    select: { contentId: true },
  })

  const existingContentIds = new Set(existingWatchLaters.map((w) => w.contentId))

  const eligibleContentIds = contentIds.filter(
    (id) => !existingContentIds.has(id),
  )

  if (eligibleContentIds.length === 0) {
    return
  }

  await prisma.watchLater.createMany({
    data: eligibleContentIds.map((contentId) => ({
      userId,
      contentId,
      addedVia: WatchLaterSource.AUTO,
      expiresAt,
      addedAt: now,
    })),
    skipDuplicates: true,
  })

  console.info(
    `[polling] Auto-assigned WatchLater for ${eligibleContentIds.length} content(s) in category ${categoryId}`,
  )
}
