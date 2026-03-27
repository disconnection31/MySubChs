import { prisma } from '@/lib/db'

/**
 * Execute WatchLater cleanup job.
 * Deletes WatchLater records where expiresAt < NOW().
 * Records with removedVia IS NOT NULL are preserved (polling exclusion markers).
 *
 * Runs daily at JST 04:00 (UTC 19:00) via BullMQ cron.
 * Retry: 3 attempts with exponential backoff (5 min base).
 */
export async function executeWatchLaterCleanup(): Promise<void> {
  const now = new Date()

  const result = await prisma.watchLater.deleteMany({
    where: {
      expiresAt: { not: null, lt: now },
      removedVia: null,
    },
  })

  console.info(
    `[watchlater-cleanup] Cleanup completed. Deleted ${result.count} expired WatchLater record(s)`,
  )
}
