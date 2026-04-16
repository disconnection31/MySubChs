import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

type MockPrisma = DeepMockProxy<PrismaClient>

// ---- Mocks ----

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

const mockQueueAdd = vi.fn()
const mockGetRepeatableJobs = vi.fn()
const mockRemoveRepeatableByKey = vi.fn()

vi.mock('@/lib/queue', () => ({
  queue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
    getRepeatableJobs: (...args: unknown[]) => mockGetRepeatableJobs(...args),
    removeRepeatableByKey: (...args: unknown[]) =>
      mockRemoveRepeatableByKey(...args),
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
  bullmqConnection: {},
}))

vi.mock('@/lib/tokenRefresh', () => ({
  ensureValidToken: vi.fn(),
}))

vi.mock('@/lib/platforms/youtube', () => ({
  YouTubeQuotaExceededError: class YouTubeQuotaExceededError extends Error {},
}))

vi.mock('./polling', () => ({
  executePolling: vi.fn(),
  setQuotaExhausted: vi.fn(),
}))

vi.mock('./contentCleanup', () => ({
  executeContentCleanup: vi.fn(),
}))

vi.mock('./setup', () => ({
  executeSetupJob: vi.fn(),
}))

vi.mock('./watchLaterCleanup', () => ({
  executeWatchLaterCleanup: vi.fn(),
}))

// bullmq の Worker はトップレベルで import されるが、VITEST 環境下では main() を
// 起動しないため実体化されない。念のためコンストラクタ呼び出しを no-op にする。
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  Job: class {},
}))

import { isKnownJobName, reconcileRepeatableJobs } from './worker'

let prismaMock: MockPrisma

describe('worker', () => {
  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    mockReset(prismaMock)
    vi.clearAllMocks()

    // デフォルトでは DB にカテゴリが存在しない状態
    prismaMock.category.findMany.mockResolvedValue([])
  })

  describe('isKnownJobName', () => {
    it('auto-poll-{id} は既知', () => {
      expect(isKnownJobName('auto-poll-cat-123')).toBe(true)
    })

    it('content-cleanup / watchlater-cleanup / setup は既知', () => {
      expect(isKnownJobName('content-cleanup')).toBe(true)
      expect(isKnownJobName('watchlater-cleanup')).toBe(true)
      expect(isKnownJobName('setup')).toBe(true)
    })

    it('setup-{userId} 形式も既知', () => {
      expect(isKnownJobName('setup-user-1')).toBe(true)
    })

    it('auto-poll:{id} (旧コロン形式) は未知', () => {
      expect(isKnownJobName('auto-poll:cat-123')).toBe(false)
    })

    it('不明なプレフィックスは未知', () => {
      expect(isKnownJobName('foo-bar')).toBe(false)
    })

    it('manual-poll-{id} は既知リストに含まれない', () => {
      // manual-poll は one-shot だが repeatable に誤登録された場合は削除される想定
      expect(isKnownJobName('manual-poll-cat-123')).toBe(false)
    })
  })

  describe('reconcileRepeatableJobs - 孤児ジョブ削除 (Issue #157)', () => {
    it('既知のジョブ (auto-poll-*, content-cleanup, watchlater-cleanup, setup, setup-*) は削除されない', async () => {
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll-cat-1', key: 'key-auto-1', every: '1800000' },
        { name: 'content-cleanup', key: 'key-cc' },
        { name: 'watchlater-cleanup', key: 'key-wlc' },
        { name: 'setup', key: 'key-setup' },
        { name: 'setup-user-1', key: 'key-setup-user' },
      ])
      // 対応する DB カテゴリが存在するとして auto-poll-cat-1 は削除対象にしない
      prismaMock.category.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          notificationSetting: {
            autoPollingEnabled: true,
            pollingIntervalMinutes: 30,
          },
          user: { userSetting: { pollingIntervalMinutes: 30 } },
        } as never,
      ])

      await reconcileRepeatableJobs()

      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith('key-auto-1')
      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith('key-cc')
      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith('key-wlc')
      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith('key-setup')
      expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith(
        'key-setup-user',
      )
    })

    it('旧コロン形式 auto-poll:{id} のジョブは孤児として削除され、ログが出力される', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'auto-poll:cat-1', key: 'key-legacy', every: '1800000' },
      ])

      await reconcileRepeatableJobs()

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-legacy')
      expect(infoSpy).toHaveBeenCalledWith(
        '[worker] Removed unknown orphan job auto-poll:cat-1',
      )

      infoSpy.mockRestore()
    })

    it('不明プレフィックス foo-bar のジョブも孤児として削除される', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockGetRepeatableJobs.mockResolvedValue([
        { name: 'foo-bar', key: 'key-foo' },
      ])

      await reconcileRepeatableJobs()

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-foo')
      expect(infoSpy).toHaveBeenCalledWith(
        '[worker] Removed unknown orphan job foo-bar',
      )

      infoSpy.mockRestore()
    })

    it('DB不整合 orphan 削除ロジックと共存できる (未知孤児 + DB非存在 auto-poll)', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      mockGetRepeatableJobs.mockResolvedValue([
        // 未知形式の孤児
        { name: 'auto-poll:legacy', key: 'key-legacy' },
        // DB に存在しないカテゴリの auto-poll ジョブ (既存の orphan 削除対象)
        {
          name: 'auto-poll-missing-cat',
          key: 'key-missing',
          every: '1800000',
        },
      ])
      // DB にカテゴリは存在しない
      prismaMock.category.findMany.mockResolvedValue([])

      await reconcileRepeatableJobs()

      // 未知形式は新ロジックで削除される
      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-legacy')
      expect(infoSpy).toHaveBeenCalledWith(
        '[worker] Removed unknown orphan job auto-poll:legacy',
      )

      // DB 非存在の auto-poll は既存ロジックで削除される
      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('key-missing')
      expect(infoSpy).toHaveBeenCalledWith(
        '[worker] Removed orphan job auto-poll-missing-cat',
      )

      infoSpy.mockRestore()
    })
  })
})
