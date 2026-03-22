import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { executeContentCleanup } from './contentCleanup'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

describe('contentCleanup', () => {
  const NOW = new Date('2026-03-22T18:00:00.000Z')
  let prismaMock: MockPrisma

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    prismaMock = await getPrismaMock()
    mockReset(prismaMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips cleanup when no user settings exist', async () => {
    prismaMock.userSetting.findMany.mockResolvedValue([])

    await executeContentCleanup()

    expect(prismaMock.content.deleteMany).not.toHaveBeenCalled()
  })

  it('deletes expired content for a user with 60-day retention', async () => {
    prismaMock.userSetting.findMany.mockResolvedValue([
      {
        id: 'setting-1',
        userId: 'user-1',
        pollingIntervalMinutes: 30,
        contentRetentionDays: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    prismaMock.content.deleteMany.mockResolvedValue({ count: 5 })

    await executeContentCleanup()

    expect(prismaMock.content.deleteMany).toHaveBeenCalledTimes(1)
    const callArgs = prismaMock.content.deleteMany.mock.calls[0][0]
    const where = callArgs!.where!

    // Cutoff date: 2026-03-22 - 60 days = 2026-01-21T18:00:00Z
    const expectedCutoff = new Date('2026-01-21T18:00:00.000Z')

    expect(where.channel).toEqual({ userId: 'user-1' })
    expect(where.status).toEqual({ not: 'LIVE' })
    expect(where.OR).toHaveLength(5)

    // VIDEO with publishedAt
    expect(where.OR![0]).toEqual({
      type: 'VIDEO',
      publishedAt: { lt: expectedCutoff },
    })

    // VIDEO with publishedAt null → createdAt fallback
    expect(where.OR![1]).toEqual({
      type: 'VIDEO',
      publishedAt: null,
      createdAt: { lt: expectedCutoff },
    })

    // LIVE with actualStartAt
    expect(where.OR![2]).toEqual({
      type: 'LIVE',
      actualStartAt: { lt: expectedCutoff },
    })

    // LIVE with actualStartAt null → scheduledStartAt fallback
    expect(where.OR![3]).toEqual({
      type: 'LIVE',
      actualStartAt: null,
      scheduledStartAt: { lt: expectedCutoff },
    })

    // LIVE with both null → createdAt fallback
    expect(where.OR![4]).toEqual({
      type: 'LIVE',
      actualStartAt: null,
      scheduledStartAt: null,
      createdAt: { lt: expectedCutoff },
    })
  })

  it('processes multiple users with different retention periods', async () => {
    prismaMock.userSetting.findMany.mockResolvedValue([
      {
        id: 'setting-1',
        userId: 'user-1',
        pollingIntervalMinutes: 30,
        contentRetentionDays: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'setting-2',
        userId: 'user-2',
        pollingIntervalMinutes: 30,
        contentRetentionDays: 90,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    prismaMock.content.deleteMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 7 })

    await executeContentCleanup()

    expect(prismaMock.content.deleteMany).toHaveBeenCalledTimes(2)

    // User 1: 30-day retention → cutoff = 2026-02-20T18:00:00Z
    const call1Where = prismaMock.content.deleteMany.mock.calls[0][0]!.where!
    expect(call1Where.channel).toEqual({ userId: 'user-1' })
    const expectedCutoff1 = new Date('2026-02-20T18:00:00.000Z')
    expect(call1Where.OR![0]).toEqual({
      type: 'VIDEO',
      publishedAt: { lt: expectedCutoff1 },
    })

    // User 2: 90-day retention → cutoff = 2025-12-22T18:00:00Z
    const call2Where = prismaMock.content.deleteMany.mock.calls[1][0]!.where!
    expect(call2Where.channel).toEqual({ userId: 'user-2' })
    const expectedCutoff2 = new Date('2025-12-22T18:00:00.000Z')
    expect(call2Where.OR![0]).toEqual({
      type: 'VIDEO',
      publishedAt: { lt: expectedCutoff2 },
    })
  })

  it('handles zero deletions without error', async () => {
    prismaMock.userSetting.findMany.mockResolvedValue([
      {
        id: 'setting-1',
        userId: 'user-1',
        pollingIntervalMinutes: 30,
        contentRetentionDays: 365,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    prismaMock.content.deleteMany.mockResolvedValue({ count: 0 })

    await executeContentCleanup()

    expect(prismaMock.content.deleteMany).toHaveBeenCalledTimes(1)
  })
})
