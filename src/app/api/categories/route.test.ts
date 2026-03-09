import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRequest } from '@/tests/helpers/request-helper'

const mockPrisma = vi.hoisted(() => ({
  category: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET, POST } from './route'

import { getServerSession } from 'next-auth'

const mockSession = { user: { id: 'user-1' }, expires: '2099-12-31' }

beforeEach(() => {
  vi.clearAllMocks()
})

const baseCategory = {
  id: 'cat-1',
  name: 'テストカテゴリ',
  sortOrder: 0,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  notificationSetting: {
    id: 'ns-1',
    categoryId: 'cat-1',
    userId: 'user-1',
    notifyOnNewVideo: true,
    notifyOnLiveStart: true,
    notifyOnUpcoming: true,
    watchLaterDefault: false,
    autoExpireHours: null,
    autoPollingEnabled: true,
    pollingIntervalMinutes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
}

describe('GET /api/categories', () => {
  it('未認証の場合 401 UNAUTHORIZED を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('認証済みでカテゴリが存在しない場合 200 で空配列を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    mockPrisma.category.findMany.mockResolvedValue([])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('認証済みでカテゴリが存在する場合 200 で sortOrder 昇順・settings フィールド付きで返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    const cat2 = { ...baseCategory, id: 'cat-2', name: '二番目', sortOrder: 1 }
    mockPrisma.category.findMany.mockResolvedValue([baseCategory, cat2])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('cat-1')
    expect(body[0].sortOrder).toBe(0)
    expect(body[0].settings).toMatchObject({
      notifyOnNewVideo: true,
      notifyOnLiveStart: true,
      notifyOnUpcoming: true,
      watchLaterDefault: false,
      autoExpireHours: null,
      autoPollingEnabled: true,
      pollingIntervalMinutes: null,
    })
    expect(body[1].id).toBe('cat-2')
    expect(body[1].sortOrder).toBe(1)
  })
})

describe('POST /api/categories', () => {
  it('未認証の場合 401 UNAUTHORIZED を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const req = buildRequest('/api/categories', { method: 'POST', body: { name: 'テスト' } })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('name が空文字の場合 400 CATEGORY_NAME_EMPTY を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    const req = buildRequest('/api/categories', { method: 'POST', body: { name: '' } })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NAME_EMPTY')
  })

  it('name が 51 文字の場合 400 CATEGORY_NAME_TOO_LONG を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    const longName = 'あ'.repeat(51)
    const req = buildRequest('/api/categories', { method: 'POST', body: { name: longName } })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NAME_TOO_LONG')
  })

  it('正常作成時に 201 で作成されたカテゴリ（notificationSetting含む）を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    mockPrisma.category.aggregate.mockResolvedValue({
      _max: { sortOrder: null },
    })
    mockPrisma.category.create.mockResolvedValue(baseCategory)

    const req = buildRequest('/api/categories', { method: 'POST', body: { name: 'テストカテゴリ' } })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('cat-1')
    expect(body.name).toBe('テストカテゴリ')
    expect(body.settings).toBeDefined()
    expect(body.settings.notifyOnNewVideo).toBe(true)
  })

  it('同名重複（P2002）の場合 409 CATEGORY_NAME_DUPLICATE を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    mockPrisma.category.aggregate.mockResolvedValue({
      _max: { sortOrder: 0 },
    })
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library')
    mockPrisma.category.create.mockRejectedValue(
      new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: {},
        batchRequestIdx: 0,
      }),
    )

    const req = buildRequest('/api/categories', { method: 'POST', body: { name: '重複カテゴリ' } })
    const res = await POST(req)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NAME_DUPLICATE')
  })
})
