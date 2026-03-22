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

function makeCategoryWithSetting(id: string, sortOrder: number) {
  return {
    id,
    userId: 'user-1',
    name: `カテゴリ${sortOrder}`,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    notificationSetting: {
      id: `ns-${id}`,
      userId: 'user-1',
      categoryId: id,
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: false,
      watchLaterDefault: false,
      autoExpireHours: null,
      autoPollingEnabled: true,
      pollingIntervalMinutes: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

describe('PATCH /api/categories/reorder', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: ['cat-1', 'cat-2'] },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('orderedIds が配列でない場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: 'not-an-array' },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('orderedIds がユーザーのカテゴリと一致しない場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1' },
      { id: 'cat-2' },
    ] as never)
    const request = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: ['cat-1', 'cat-3'] },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('カテゴリの並び替えに成功する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    // First findMany call for validation (select: { id: true })
    // Second findMany call for fetching updated categories
    prismaMock.category.findMany
      .mockResolvedValueOnce([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ] as never)
      .mockResolvedValueOnce([
        makeCategoryWithSetting('cat-2', 0),
        makeCategoryWithSetting('cat-1', 1),
      ] as never)

    prismaMock.$transaction.mockResolvedValue([{}, {}] as never)

    const request = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: ['cat-2', 'cat-1'] },
    })

    const response = await PATCH(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('cat-2')
    expect(body[1].id).toBe('cat-1')
  })
})
