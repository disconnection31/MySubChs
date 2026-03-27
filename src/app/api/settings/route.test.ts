import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { YOUTUBE_QUOTA_DAILY_LIMIT, YOUTUBE_QUOTA_WARNING_THRESHOLD } from '@/lib/config'
import { buildRequest } from '@/tests/helpers/request-helper'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { prisma: mock }
})

const mockGetAuthenticatedSession = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthenticatedSession: mockGetAuthenticatedSession,
  }
})

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
  },
  bullmqConnection: {},
}))

vi.mock('@/lib/bullmq-helpers', () => ({
  bulkUpdateGlobalInterval: vi.fn().mockResolvedValue(undefined),
}))

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

let prismaMock: MockPrisma

beforeEach(async () => {
  prismaMock = await getPrismaMock()
  mockReset(prismaMock)
  mockGetAuthenticatedSession.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }

const now = new Date('2026-03-22T00:00:00.000Z')

describe('GET /api/settings', () => {
  let GET: typeof import('./route').GET

  beforeEach(async () => {
    const mod = await import('./route')
    GET = mod.GET
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('設定とクォータ情報を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

    prismaMock.userSetting.upsert.mockResolvedValue({
      id: 'us-1',
      userId: 'user-1',
      pollingIntervalMinutes: 30,
      contentRetentionDays: 60,
      createdAt: now,
      updatedAt: now,
    } as never)

    prismaMock.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        userId: 'user-1',
        name: 'テストカテゴリ',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        notificationSetting: {
          pollingIntervalMinutes: null,
          autoPollingEnabled: true,
        },
        _count: { channels: 5 },
      },
    ] as never)

    prismaMock.account.findFirst.mockResolvedValue({
      token_error: null,
    } as never)

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.pollingIntervalMinutes).toBe(30)
    expect(body.contentRetentionDays).toBe(60)
    expect(body.quotaDailyLimit).toBe(YOUTUBE_QUOTA_DAILY_LIMIT)
    expect(body.quotaWarningThreshold).toBe(YOUTUBE_QUOTA_WARNING_THRESHOLD)
    expect(body.tokenStatus).toBe('valid')
    expect(body.quotaExhaustedUntil).toBeNull()
    expect(typeof body.estimatedDailyQuota).toBe('number')
  })
})

describe('PATCH /api/settings', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/settings', {
      method: 'PATCH',
      body: { pollingIntervalMinutes: 30 },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('更新フィールドが指定されていない場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/settings', {
      method: 'PATCH',
      body: {},
    })

    const response = await PATCH(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('不正なポーリング間隔の場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/settings', {
      method: 'PATCH',
      body: { pollingIntervalMinutes: 15 },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('INVALID_POLLING_INTERVAL')
  })

  it('設定を正常に更新する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.userSetting.upsert.mockResolvedValue({
      id: 'us-1',
      userId: 'user-1',
      pollingIntervalMinutes: 10,
      contentRetentionDays: 60,
      createdAt: now,
      updatedAt: now,
    } as never)

    const request = buildRequest('/api/settings', {
      method: 'PATCH',
      body: { pollingIntervalMinutes: 10 },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.pollingIntervalMinutes).toBe(10)
    expect(body.contentRetentionDays).toBe(60)
  })
})
