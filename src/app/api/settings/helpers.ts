import { ESTIMATED_QUOTA_OVERHEAD_PER_POLL } from '@/lib/config'

export type CategoryQuotaInput = {
  channelCount: number
  effectiveInterval: number
  autoPollingEnabled: boolean
}

/**
 * 全カテゴリ合算の推定1日クォータ消費量を計算する。
 * 計算式 (youtube-polling.md §11):
 *   Σ_{autoPollingEnabled=true の各カテゴリ} (channelCount + ESTIMATED_QUOTA_OVERHEAD_PER_POLL) × (1440 / effectiveInterval)
 *
 * @returns 推定1日クォータ消費量（整数、切り上げ）
 */
export function calculateEstimatedDailyQuota(categories: CategoryQuotaInput[]): number {
  const total = categories
    .filter((c) => c.autoPollingEnabled)
    .reduce((sum, c) => {
      const pollsPerDay = 1440 / c.effectiveInterval
      const unitsPerPoll = c.channelCount + ESTIMATED_QUOTA_OVERHEAD_PER_POLL
      return sum + unitsPerPoll * pollsPerDay
    }, 0)

  return Math.ceil(total)
}
