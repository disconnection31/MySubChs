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

import { PATCH } from './route'

import { getServerSession } from 'next-auth'

const mockSession = { user: { id: 'user-1' }, expires: '2099-12-31' }

beforeEach(() => {
  vi.clearAllMocks()
})

const makeCategory = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  sortOrder,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  notificationSetting: {
    id: `ns-${id}`,
    categoryId: id,
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
})

describe('PATCH /api/categories/reorder', () => {
  it('未認証の場合 401 UNAUTHORIZED を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const req = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: ['cat-1', 'cat-2'] },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('orderedIds が空配列の場合 400 を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    const req = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: [] },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('orderedIds が配列でない場合 400 を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    const req = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: 'not-an-array' },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('正常並べ替え時に 200 で並べ替え後の一覧を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    mockPrisma.$transaction.mockResolvedValue([{ count: 1 }, { count: 1 }])

    const reorderedCategories = [
      makeCategory('cat-2', '二番目', 0),
      makeCategory('cat-1', 'テストカテゴリ', 1),
    ]
    mockPrisma.category.findMany.mockResolvedValue(reorderedCategories)

    const req = buildRequest('/api/categories/reorder', {
      method: 'PATCH',
      body: { orderedIds: ['cat-2', 'cat-1'] },
    })
    const res = await PATCH(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('cat-2')
    expect(body[0].sortOrder).toBe(0)
    expect(body[1].id).toBe('cat-1')
    expect(body[1].sortOrder).toBe(1)
  })
})
