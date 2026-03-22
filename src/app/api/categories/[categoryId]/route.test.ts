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

function makeCategoryWithSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    userId: 'user-1',
    name: 'テストカテゴリ',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    notificationSetting: {
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
    },
    ...overrides,
  }
}

const context = { params: Promise.resolve({ categoryId: 'cat-1' }) }

describe('PATCH /api/categories/[categoryId]', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1', {
      method: 'PATCH',
      body: { name: '更新名' },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1', {
      method: 'PATCH',
      body: { name: '更新名' },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('名前が空の場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(makeCategoryWithSetting() as never)
    const request = buildRequest('/api/categories/cat-1', {
      method: 'PATCH',
      body: { name: '' },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NAME_EMPTY')
  })

  it('カテゴリ名を正常に更新する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(makeCategoryWithSetting() as never)
    const updated = makeCategoryWithSetting({ name: '更新後の名前' })
    prismaMock.category.update.mockResolvedValue(updated as never)
    const request = buildRequest('/api/categories/cat-1', {
      method: 'PATCH',
      body: { name: '更新後の名前' },
    })

    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.name).toBe('更新後の名前')
    expect(body.settings).toBeDefined()
  })
})

describe('DELETE /api/categories/[categoryId]', () => {
  let DELETE: typeof import('./route').DELETE

  beforeEach(async () => {
    const mod = await import('./route')
    DELETE = mod.DELETE
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1', { method: 'DELETE' })

    const response = await DELETE(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1', { method: 'DELETE' })

    const response = await DELETE(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('カテゴリを削除して 204 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(makeCategoryWithSetting() as never)
    prismaMock.category.delete.mockResolvedValue(makeCategoryWithSetting() as never)
    const request = buildRequest('/api/categories/cat-1', { method: 'DELETE' })

    const response = await DELETE(request, context)

    expect(response.status).toBe(204)
  })
})
