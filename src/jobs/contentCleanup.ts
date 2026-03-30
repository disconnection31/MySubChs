import { prisma } from '@/lib/db'

/**
 * Execute content cleanup job.
 * Deletes content that exceeds each user's contentRetentionDays setting.
 * - VIDEO/SHORT: based on publishedAt (fallback to createdAt)
 * - LIVE: based on actualStartAt → scheduledStartAt → createdAt (fallback chain)
 * - status=LIVE is excluded (actively streaming)
 * - WatchLater records are cascade-deleted via DB constraint (onDelete: Cascade)
 */
export async function executeContentCleanup(): Promise<void> {
  const now = new Date()

  // Step 1: Get all users' retention settings
  const userSettings = await prisma.userSetting.findMany({
    select: {
      userId: true,
      contentRetentionDays: true,
    },
  })

  if (userSettings.length === 0) {
    console.info('[content-cleanup] No user settings found, skipping cleanup')
    return
  }

  let totalDeleted = 0

  // Step 2: Process each user
  for (const setting of userSettings) {
    const cutoffDate = new Date(now.getTime() - setting.contentRetentionDays * 24 * 60 * 60 * 1000)

    // Step 3: Delete expired content
    const result = await prisma.content.deleteMany({
      where: {
        channel: { userId: setting.userId },
        status: { not: 'LIVE' },
        OR: [
          // VIDEO/SHORT: publishedAt based (fallback to createdAt when null)
          {
            type: { in: ['VIDEO', 'SHORT'] },
            publishedAt: { lt: cutoffDate },
          },
          {
            type: { in: ['VIDEO', 'SHORT'] },
            publishedAt: null,
            createdAt: { lt: cutoffDate },
          },
          // LIVE: actualStartAt → scheduledStartAt → createdAt fallback chain
          {
            type: 'LIVE',
            actualStartAt: { lt: cutoffDate },
          },
          {
            type: 'LIVE',
            actualStartAt: null,
            scheduledStartAt: { lt: cutoffDate },
          },
          {
            type: 'LIVE',
            actualStartAt: null,
            scheduledStartAt: null,
            createdAt: { lt: cutoffDate },
          },
        ],
      },
    })

    if (result.count > 0) {
      console.info(
        `[content-cleanup] Deleted ${result.count} expired content(s) for user ${setting.userId} (retention: ${setting.contentRetentionDays} days)`,
      )
    }

    totalDeleted += result.count
  }

  console.info(`[content-cleanup] Cleanup completed. Total deleted: ${totalDeleted}`)
}
