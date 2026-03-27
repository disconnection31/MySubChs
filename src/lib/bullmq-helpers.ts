import { AUTO_POLL_JOB_PREFIX, DEFAULT_POLLING_INTERVAL_MINUTES } from '@/lib/config'
import { prisma } from '@/lib/db'
import { queue } from '@/lib/queue'

function autoPollJobName(categoryId: string): string {
  return `${AUTO_POLL_JOB_PREFIX}${categoryId}`
}

export async function registerPollingJob(
  categoryId: string,
  intervalMs: number,
): Promise<void> {
  const jobName = autoPollJobName(categoryId)
  await queue.add(
    jobName,
    { categoryId },
    {
      repeat: { every: intervalMs },
      jobId: jobName,
    },
  )
}

export async function removePollingJob(categoryId: string): Promise<void> {
  const jobName = autoPollJobName(categoryId)
  const repeatableJobs = await queue.getRepeatableJobs()
  const target = repeatableJobs.find((j) => j.name === jobName)
  if (target) {
    await queue.removeRepeatableByKey(target.key)
  }
}

export async function updatePollingJobInterval(
  categoryId: string,
  newIntervalMs: number,
): Promise<void> {
  await removePollingJob(categoryId)
  await registerPollingJob(categoryId, newIntervalMs)
}

/**
 * Bulk update polling jobs when the global pollingIntervalMinutes changes.
 * Only affects categories where:
 * - NotificationSetting.pollingIntervalMinutes IS NULL (using global default)
 * - NotificationSetting.autoPollingEnabled = true
 */
export async function bulkUpdateGlobalInterval(
  userId: string,
  newGlobalIntervalMinutes: number,
): Promise<void> {
  const categories = await prisma.category.findMany({
    where: {
      userId,
      notificationSetting: {
        autoPollingEnabled: true,
        pollingIntervalMinutes: null,
      },
    },
    select: { id: true },
  })

  if (categories.length === 0) return

  const newIntervalMs = newGlobalIntervalMinutes * 60 * 1000

  // Fetch repeatable jobs once to avoid N+1 Redis calls
  const repeatableJobs = await queue.getRepeatableJobs()

  for (const category of categories) {
    const jobName = autoPollJobName(category.id)
    const target = repeatableJobs.find((j) => j.name === jobName)
    if (target) {
      await queue.removeRepeatableByKey(target.key)
    }
    await registerPollingJob(category.id, newIntervalMs)
  }
}

/**
 * Get the effective polling interval in milliseconds for a category.
 * Uses the category-specific interval if set, otherwise falls back to user global setting.
 */
export async function getEffectiveIntervalMs(
  userId: string,
  categoryPollingIntervalMinutes: number | null,
): Promise<number> {
  if (categoryPollingIntervalMinutes !== null) {
    return categoryPollingIntervalMinutes * 60 * 1000
  }

  const userSetting = await prisma.userSetting.findUnique({
    where: { userId },
    select: { pollingIntervalMinutes: true },
  })

  const globalInterval = userSetting?.pollingIntervalMinutes ?? DEFAULT_POLLING_INTERVAL_MINUTES
  return globalInterval * 60 * 1000
}
