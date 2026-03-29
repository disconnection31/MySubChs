import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

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

// Mock BullMQ queue
const mockQueueAdd = vi.fn()
const mockGetRepeatableJobs = vi.fn()
const mockRemoveRepeatableByKey = vi.fn()

vi.mock('@/lib/queue', () => ({
  queue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
    getRepeatableJobs: (...args: unknown[]) => mockGetRepeatableJobs(...args),
    removeRepeatableByKey: (...args: unknown[]) => mockRemoveRepeatableByKey(...args),
  },
}))

import {
  bulkUpdateGlobalInterval,
  getEffectiveIntervalMs,
  registerPollingJob,
  removePollingJob,
  updatePollingJobInterval,
} from './bullmq-helpers'

let prismaMock: MockPrisma

describe('bullmq-helpers', () => {
  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    mockReset(prismaMock)
    vi.clearAllMocks()
  })

  describe('registerPollingJob', () => {
    it('queue.add を正しいパラメータで呼び出す', async () => {
      mockQueueAdd.mockResolvedValue(undefined)

      await registerPollingJob('cat-123', 1800000)

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'auto-poll-cat-123',
        { categoryId: 'cat-123' },
        {
          repeat: { every: 1800000 },
          jobId: 'auto-poll-cat-123',
        },
      )
    })
  })

  describe('removePollingJob', () => {
    it('該当するジョブが存在する場合に removeRepeatableByKey を呼び出す', async () => {
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll-cat-123', key: 'key-123', every: '1800000' },
        { name: 'auto-poll-cat-456', key: 'key-456', every: '600000' },
      ])
      mockRemoveRepeatableByKey.mockResolvedValue(undefined)

      await removePollingJob('cat-123')

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-123')
    })

    it('該当するジョブが存在しない場合は何もしない', async () => {
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll-cat-456', key: 'key-456', every: '600000' },
      ])

      await removePollingJob('cat-999')

      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled()
    })
  })

  describe('updatePollingJobInterval', () => {
    it('旧ジョブを削除して新しい間隔で再登録する', async () => {
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll-cat-123', key: 'key-123', every: '1800000' },
      ])
      mockRemoveRepeatableByKey.mockResolvedValue(undefined)
      mockQueueAdd.mockResolvedValue(undefined)

      await updatePollingJobInterval('cat-123', 600000)

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-123')
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'auto-poll-cat-123',
        { categoryId: 'cat-123' },
        {
          repeat: { every: 600000 },
          jobId: 'auto-poll-cat-123',
        },
      )
    })
  })

  describe('bulkUpdateGlobalInterval', () => {
    it('グローバル設定を使用している全カテゴリのジョブを更新する', async () => {
      prismaMock.category.findMany.mockResolvedValue([
        { id: 'cat-1' } as never,
        { id: 'cat-2' } as never,
      ])
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll-cat-1', key: 'key-1', every: '1800000' },
        { name: 'auto-poll-cat-2', key: 'key-2', every: '1800000' },
      ])
      mockRemoveRepeatableByKey.mockResolvedValue(undefined)
      mockQueueAdd.mockResolvedValue(undefined)

      await bulkUpdateGlobalInterval('user-1', 10)

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          notificationSetting: {
            autoPollingEnabled: true,
            pollingIntervalMinutes: null,
          },
        },
        select: { id: true },
      })

      // Each category should get its job removed and re-registered
      expect(mockRemoveRepeatableByKey).toHaveBeenCalledTimes(2)
      expect(mockQueueAdd).toHaveBeenCalledTimes(2)

      // Verify the new interval is 10 minutes = 600000ms
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'auto-poll-cat-1',
        { categoryId: 'cat-1' },
        {
          repeat: { every: 600000 },
          jobId: 'auto-poll-cat-1',
        },
      )
    })

    it('対象カテゴリがない場合は何もしない', async () => {
      prismaMock.category.findMany.mockResolvedValue([])

      await bulkUpdateGlobalInterval('user-1', 30)

      expect(mockGetRepeatableJobs).not.toHaveBeenCalled()
      expect(mockQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe('getEffectiveIntervalMs', () => {
    it('カテゴリ固有の間隔が設定されている場合はそれを使用する', async () => {
      const result = await getEffectiveIntervalMs('user-1', 10)

      expect(result).toBe(600000) // 10 * 60 * 1000
      expect(prismaMock.userSetting.findUnique).not.toHaveBeenCalled()
    })

    it('カテゴリ固有の間隔がnullの場合はユーザーグローバル設定を使用する', async () => {
      prismaMock.userSetting.findUnique.mockResolvedValue({
        id: 'setting-1',
        userId: 'user-1',
        pollingIntervalMinutes: 60,
        contentRetentionDays: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await getEffectiveIntervalMs('user-1', null)

      expect(result).toBe(3600000) // 60 * 60 * 1000
      expect(prismaMock.userSetting.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { pollingIntervalMinutes: true },
      })
    })

    it('UserSettingが存在しない場合はデフォルト値（30分）を使用する', async () => {
      prismaMock.userSetting.findUnique.mockResolvedValue(null)

      const result = await getEffectiveIntervalMs('user-1', null)

      expect(result).toBe(1800000) // 30 * 60 * 1000
    })
  })
})
