import { DEFAULT_POLLING_INTERVAL_MINUTES } from '@/lib/config'
import { prisma } from '@/lib/db'
import { queue } from '@/lib/queue'

/**
 * Register a BullMQ repeatable polling job for a category.
 *
 * @param categoryId - Target category ID
 * @param intervalMs - Polling interval in milliseconds
 */
export async function registerPollingJob(
  categoryId: string,
  intervalMs: number,
): Promise<void> {
  const jobName = `auto-poll:${categoryId}`
  await queue.add(
    jobName,
    { categoryId },
    {
      repeat: { every: intervalMs },
      jobId: jobName,
    },
  )
}

/**
 * Remove a BullMQ repeatable polling job for a category.
 * Searches existing repeatable jobs by name and removes the matching one.
 *
 * @param categoryId - Target category ID
 */
export async function removePollingJob(categoryId: string): Promise<void> {
  const jobName = `auto-poll:${categoryId}`
  const repeatableJobs = await queue.getRepeatableJobs()
  const target = repeatableJobs.find((j) => j.name === jobName)
  if (target) {
    await queue.removeRepeatableByKey(target.key)
  }
}

/**
 * Update a BullMQ repeatable polling job's interval.
 * Removes the old job and registers a new one with the updated interval.
 *
 * @param categoryId - Target category ID
 * @param newIntervalMs - New polling interval in milliseconds
 */
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
 *
 * @param userId - The user whose categories to update
 * @param newGlobalIntervalMinutes - New global polling interval in minutes
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

  const newIntervalMs = newGlobalIntervalMinutes * 60 * 1000

  for (const category of categories) {
    await removePollingJob(category.id)
    await registerPollingJob(category.id, newIntervalMs)
  }
}

/**
 * Get the effective polling interval in milliseconds for a category.
 * Uses the category-specific interval if set, otherwise falls back to user global setting.
 *
 * @param userId - The user ID
 * @param categoryPollingIntervalMinutes - Category-specific interval (null = use global)
 * @returns Interval in milliseconds
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
