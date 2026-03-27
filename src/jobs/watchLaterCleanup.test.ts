import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { executeWatchLaterCleanup } from './watchLaterCleanup'

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

describe('watchLaterCleanup', () => {
  const NOW = new Date('2026-03-27T19:00:00.000Z') // JST 04:00
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

  it('deletes expired WatchLater records with removedVia IS NULL', async () => {
    prismaMock.watchLater.deleteMany.mockResolvedValue({ count: 5 })

    await executeWatchLaterCleanup()

    expect(prismaMock.watchLater.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: NOW },
        removedVia: null,
      },
    })
  })

  it('handles zero deletions without error', async () => {
    prismaMock.watchLater.deleteMany.mockResolvedValue({ count: 0 })

    await executeWatchLaterCleanup()

    expect(prismaMock.watchLater.deleteMany).toHaveBeenCalledTimes(1)
  })

  it('does not delete records with removedVia IS NOT NULL (filter condition)', async () => {
    prismaMock.watchLater.deleteMany.mockResolvedValue({ count: 3 })

    await executeWatchLaterCleanup()

    // Verify the where clause explicitly excludes removedVia IS NOT NULL
    const callArgs = prismaMock.watchLater.deleteMany.mock.calls[0][0]
    expect(callArgs!.where!.removedVia).toEqual(null)
  })
})
