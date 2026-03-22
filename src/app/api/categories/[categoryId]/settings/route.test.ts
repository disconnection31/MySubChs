import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { buildRequest } from '@/tests/helpers/request-helper'

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

const mockGetAuthenticatedSession = vi.fn()

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthenticatedSession: mockGetAuthenticatedSession,
  }
})

let prismaMock: MockPrisma

beforeEach(async () => {
  prismaMock = await getPrismaMock()
  mockReset(prismaMock)
  mockGetAuthenticatedSession.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }
const now = new Date('2026-03-22T00:00:00.000Z')

function makeNotificationSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ns-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    notifyOnNewVideo: true,
    notifyOnLiveStart: true,
    notifyOnUpcoming: false,
    watchLaterDefault: false,
    autoExpireHours: null,
    autoPollingEnabled: true,
    pollingIntervalMinutes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const context = { params: Promise.resolve({ categoryId: 'cat-1' }) }

describe('GET /api/categories/[categoryId]/settings', () => {
  let GET: typeof import('./route').GET

  beforeEach(async () => {
    const mod = await import('./route')
    GET = mod.GET
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/settings')

    const response = await GET(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.notificationSetting.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/settings')

    const response = await GET(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('通知設定を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const setting = makeNotificationSetting()
    prismaMock.notificationSetting.findFirst.mockResolvedValue(setting as never)
    const request = buildRequest('/api/categories/cat-1/settings')

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.notifyOnNewVideo).toBe(true)
    expect(body.notifyOnLiveStart).toBe(true)
    expect(body.notifyOnUpcoming).toBe(false)
    expect(body.watchLaterDefault).toBe(false)
    expect(body.autoExpireHours).toBeNull()
    expect(body.autoPollingEnabled).toBe(true)
    expect(body.pollingIntervalMinutes).toBeNull()
    // 内部フィールドが除外されていることを確認
    expect(body.id).toBeUndefined()
    expect(body.userId).toBeUndefined()
    expect(body.categoryId).toBeUndefined()
  })
})

describe('PATCH /api/categories/[categoryId]/settings', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/settings', {
      method: 'PATCH',
      body: { notifyOnNewVideo: false },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.notificationSetting.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/settings', {
      method: 'PATCH',
      body: { notifyOnNewVideo: false },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('更新フィールドが指定されていない場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.notificationSetting.findFirst.mockResolvedValue(makeNotificationSetting() as never)
    const request = buildRequest('/api/categories/cat-1/settings', {
      method: 'PATCH',
      body: {},
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('通知設定を正常に更新する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const existing = makeNotificationSetting()
    prismaMock.notificationSetting.findFirst.mockResolvedValue(existing as never)
    const updated = makeNotificationSetting({
      notifyOnNewVideo: false,
      autoExpireHours: 24,
    })
    prismaMock.notificationSetting.update.mockResolvedValue(updated as never)
    const request = buildRequest('/api/categories/cat-1/settings', {
      method: 'PATCH',
      body: { notifyOnNewVideo: false, autoExpireHours: 24 },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.notifyOnNewVideo).toBe(false)
    expect(body.autoExpireHours).toBe(24)
  })
})
