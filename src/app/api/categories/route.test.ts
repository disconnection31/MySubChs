import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { CATEGORY_NAME_MAX_LENGTH } from '@/lib/config'
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

describe('GET /api/categories', () => {
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

  it('カテゴリ一覧を sortOrder 順で返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

    const categories = [
      makeCategoryWithSetting({ id: 'cat-1', name: 'カテゴリA', sortOrder: 0 }),
      makeCategoryWithSetting({ id: 'cat-2', name: 'カテゴリB', sortOrder: 1 }),
    ]
    prismaMock.category.findMany.mockResolvedValue(categories as never)

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('cat-1')
    expect(body[0].name).toBe('カテゴリA')
    expect(body[0].createdAt).toBe(now.toISOString())
    expect(body[0].settings).toBeDefined()
    // userId が除外されていることを確認
    expect(body[0].userId).toBeUndefined()
  })

  it('カテゴリがない場合に空配列を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findMany.mockResolvedValue([])

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual([])
  })
})

describe('POST /api/categories', () => {
  let POST: typeof import('./route').POST

  beforeEach(async () => {
    const mod = await import('./route')
    POST = mod.POST
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories', {
      method: 'POST',
      body: { name: 'テスト' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリを作成して 201 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.aggregate.mockResolvedValue({
      _max: { sortOrder: 1 },
      _min: { sortOrder: null },
      _avg: { sortOrder: null },
      _sum: { sortOrder: null },
      _count: { sortOrder: 0 },
    } as never)
    prismaMock.$transaction.mockImplementation(async (callback) => {
      return (callback as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock)
    })
    const created = makeCategoryWithSetting({ name: '新しいカテゴリ', sortOrder: 2 })
    prismaMock.category.create.mockResolvedValue(created as never)
    prismaMock.notificationSetting.create.mockResolvedValue(created.notificationSetting as never)
    prismaMock.category.findUniqueOrThrow.mockResolvedValue(created as never)

    const request = buildRequest('/api/categories', {
      method: 'POST',
      body: { name: '新しいカテゴリ' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.name).toBe('新しいカテゴリ')
    expect(body.settings).toBeDefined()
  })

  it('名前が空の場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/categories', {
      method: 'POST',
      body: { name: '' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NAME_EMPTY')
  })

  it('名前が空白のみの場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/categories', {
      method: 'POST',
      body: { name: '   ' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NAME_EMPTY')
  })

  it(`名前が${CATEGORY_NAME_MAX_LENGTH}文字を超える場合 400 を返す`, async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const longName = 'あ'.repeat(CATEGORY_NAME_MAX_LENGTH + 1)
    const request = buildRequest('/api/categories', {
      method: 'POST',
      body: { name: longName },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NAME_TOO_LONG')
  })
})
