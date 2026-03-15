import { describe, expect, it } from 'vitest'

import { calculateEstimatedDailyQuota, type CategoryQuotaInput } from './helpers'

describe('calculateEstimatedDailyQuota', () => {
  it('returns 0 when no categories', () => {
    expect(calculateEstimatedDailyQuota([])).toBe(0)
  })

  it('returns 0 when all categories have autoPollingEnabled=false', () => {
    const categories: CategoryQuotaInput[] = [
      { channelCount: 50, effectiveInterval: 30, autoPollingEnabled: false },
      { channelCount: 20, effectiveInterval: 60, autoPollingEnabled: false },
    ]
    expect(calculateEstimatedDailyQuota(categories)).toBe(0)
  })

  it('calculates correctly for 1 category (channelCount=100, interval=30)', () => {
    // (100 + 2) * (1440 / 30) = 102 * 48 = 4896
    const categories: CategoryQuotaInput[] = [
      { channelCount: 100, effectiveInterval: 30, autoPollingEnabled: true },
    ]
    expect(calculateEstimatedDailyQuota(categories)).toBe(4896)
  })

  it('calculates correctly for multiple categories with mixed autoPollingEnabled', () => {
    const categories: CategoryQuotaInput[] = [
      { channelCount: 50, effectiveInterval: 30, autoPollingEnabled: true },
      { channelCount: 20, effectiveInterval: 60, autoPollingEnabled: false }, // excluded
      { channelCount: 10, effectiveInterval: 10, autoPollingEnabled: true },
    ]
    // Category 1: (50 + 2) * (1440 / 30) = 52 * 48 = 2496
    // Category 3: (10 + 2) * (1440 / 10) = 12 * 144 = 1728
    // Total: 2496 + 1728 = 4224
    expect(calculateEstimatedDailyQuota(categories)).toBe(4224)
  })

  it('rounds up with Math.ceil when result is not integer', () => {
    // (1 + 2) * (1440 / 7) = 3 * 205.714... = 617.142...
    // Math.ceil(617.142...) = 618
    const categories: CategoryQuotaInput[] = [
      { channelCount: 1, effectiveInterval: 7, autoPollingEnabled: true },
    ]
    expect(calculateEstimatedDailyQuota(categories)).toBe(618)
  })

  it('handles channelCount=0 correctly', () => {
    // (0 + 2) * (1440 / 30) = 2 * 48 = 96
    const categories: CategoryQuotaInput[] = [
      { channelCount: 0, effectiveInterval: 30, autoPollingEnabled: true },
    ]
    expect(calculateEstimatedDailyQuota(categories)).toBe(96)
  })
})
