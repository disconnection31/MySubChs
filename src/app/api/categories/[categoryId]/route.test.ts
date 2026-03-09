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

import { DELETE, PATCH } from './route'

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

const routeContext = {
  params: Promise.resolve({ categoryId: 'cat-1' }),
}

describe('PATCH /api/categories/[categoryId]', () => {
  it('未認証の場合 401 UNAUTHORIZED を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const req = buildRequest('/api/categories/cat-1', { method: 'PATCH', body: { name: '更新名' } })
    const res = await PATCH(req, routeContext)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('name が空文字の場合 400 CATEGORY_NAME_EMPTY を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)

    const req = buildRequest('/api/categories/cat-1', { method: 'PATCH', body: { name: '' } })
    const res = await PATCH(req, routeContext)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NAME_EMPTY')
  })

  it('存在しないカテゴリの場合 404 CATEGORY_NOT_FOUND を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    mockPrisma.category.findFirst.mockResolvedValue(null)

    const req = buildRequest('/api/categories/cat-1', { method: 'PATCH', body: { name: '更新名' } })
    const res = await PATCH(req, routeContext)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('正常更新時に 200 で更新されたカテゴリを返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    const existingWithoutSetting = { ...baseCategory, notificationSetting: null }
    mockPrisma.category.findFirst.mockResolvedValue(existingWithoutSetting)
    const updated = { ...baseCategory, name: '更新名' }
    mockPrisma.category.update.mockResolvedValue(updated)

    const req = buildRequest('/api/categories/cat-1', { method: 'PATCH', body: { name: '更新名' } })
    const res = await PATCH(req, routeContext)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('更新名')
  })

  it('同名重複（P2002）の場合 409 CATEGORY_NAME_DUPLICATE を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    const existingWithoutSetting = { ...baseCategory, notificationSetting: null }
    mockPrisma.category.findFirst.mockResolvedValue(existingWithoutSetting)
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library')
    mockPrisma.category.update.mockRejectedValue(
      new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: {},
        batchRequestIdx: 0,
      }),
    )

    const req = buildRequest('/api/categories/cat-1', { method: 'PATCH', body: { name: '重複名' } })
    const res = await PATCH(req, routeContext)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NAME_DUPLICATE')
  })
})

describe('DELETE /api/categories/[categoryId]', () => {
  it('未認証の場合 401 UNAUTHORIZED を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const req = buildRequest('/api/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE(req, routeContext)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('存在しないカテゴリの場合 404 CATEGORY_NOT_FOUND を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    mockPrisma.category.findFirst.mockResolvedValue(null)

    const req = buildRequest('/api/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE(req, routeContext)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('正常削除時に 204 を返す', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession)
    const existingWithoutSetting = { ...baseCategory, notificationSetting: null }
    mockPrisma.category.findFirst.mockResolvedValue(existingWithoutSetting)
    mockPrisma.category.delete.mockResolvedValue(existingWithoutSetting)

    const req = buildRequest('/api/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE(req, routeContext)

    expect(res.status).toBe(204)
  })
})
