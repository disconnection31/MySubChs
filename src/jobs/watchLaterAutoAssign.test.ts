import { PrismaClient, WatchLaterSource } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { autoAssignWatchLater } from './watchLaterAutoAssign'

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

describe('autoAssignWatchLater', () => {
  const NOW = new Date('2026-03-27T12:00:00.000Z')
  const CATEGORY_ID = 'cat-1'
  const USER_ID = 'user-1'
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

  it('does nothing when newContentPlatformIds is empty', async () => {
    await autoAssignWatchLater(CATEGORY_ID, [], NOW)

    expect(prismaMock.category.findUnique).not.toHaveBeenCalled()
  })

  it('does nothing when category not found', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null)

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1'], NOW)

    expect(prismaMock.content.findMany).not.toHaveBeenCalled()
  })

  it('does nothing when watchLaterDefault is false', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: false,
        autoExpireHours: null,
      },
    } as any)

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1'], NOW)

    expect(prismaMock.content.findMany).not.toHaveBeenCalled()
  })

  it('creates WatchLater records with expiresAt when autoExpireHours is set', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: true,
        autoExpireHours: 72, // 3 days
      },
    } as any)

    prismaMock.content.findMany.mockResolvedValue([
      { id: 'content-1' },
      { id: 'content-2' },
    ] as any)

    prismaMock.watchLater.findMany.mockResolvedValue([])
    prismaMock.watchLater.createMany.mockResolvedValue({ count: 2 })

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1', 'vid-2'], NOW)

    expect(prismaMock.watchLater.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          contentId: 'content-1',
          addedVia: WatchLaterSource.AUTO,
          expiresAt: new Date('2026-03-30T12:00:00.000Z'), // +72 hours
          addedAt: NOW,
        },
        {
          userId: USER_ID,
          contentId: 'content-2',
          addedVia: WatchLaterSource.AUTO,
          expiresAt: new Date('2026-03-30T12:00:00.000Z'),
          addedAt: NOW,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('creates WatchLater records with null expiresAt when autoExpireHours is null', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: true,
        autoExpireHours: null,
      },
    } as any)

    prismaMock.content.findMany.mockResolvedValue([
      { id: 'content-1' },
    ] as any)

    prismaMock.watchLater.findMany.mockResolvedValue([])
    prismaMock.watchLater.createMany.mockResolvedValue({ count: 1 })

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1'], NOW)

    expect(prismaMock.watchLater.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          contentId: 'content-1',
          addedVia: WatchLaterSource.AUTO,
          expiresAt: null,
          addedAt: NOW,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('skips content with removedVia IS NOT NULL', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: true,
        autoExpireHours: 24,
      },
    } as any)

    prismaMock.content.findMany.mockResolvedValue([
      { id: 'content-1' },
      { id: 'content-2' },
    ] as any)

    // content-1 has existing WatchLater record (removedVia set)
    prismaMock.watchLater.findMany.mockResolvedValue([{ contentId: 'content-1' }] as any)

    prismaMock.watchLater.createMany.mockResolvedValue({ count: 1 })

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1', 'vid-2'], NOW)

    expect(prismaMock.watchLater.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          contentId: 'content-2',
          addedVia: WatchLaterSource.AUTO,
          expiresAt: new Date('2026-03-28T12:00:00.000Z'), // +24 hours
          addedAt: NOW,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('skips content with any existing WatchLater record', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: true,
        autoExpireHours: 24,
      },
    } as any)

    prismaMock.content.findMany.mockResolvedValue([
      { id: 'content-1' },
      { id: 'content-2' },
    ] as any)

    // content-1 has existing WatchLater record (active)
    prismaMock.watchLater.findMany.mockResolvedValue([{ contentId: 'content-1' }] as any)
    prismaMock.watchLater.createMany.mockResolvedValue({ count: 1 })

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1', 'vid-2'], NOW)

    expect(prismaMock.watchLater.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER_ID,
          contentId: 'content-2',
          addedVia: WatchLaterSource.AUTO,
          expiresAt: new Date('2026-03-28T12:00:00.000Z'),
          addedAt: NOW,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('does nothing when all content is removed or already active', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      userId: USER_ID,
      name: 'Test',
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      notificationSetting: {
        watchLaterDefault: true,
        autoExpireHours: 24,
      },
    } as any)

    prismaMock.content.findMany.mockResolvedValue([
      { id: 'content-1' },
    ] as any)

    prismaMock.watchLater.findMany.mockResolvedValue([{ contentId: 'content-1' }] as any)

    await autoAssignWatchLater(CATEGORY_ID, ['vid-1'], NOW)

    expect(prismaMock.watchLater.createMany).not.toHaveBeenCalled()
  })
})
