import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockReset } from 'vitest-mock-extended'

import { MANUAL_POLLING_COOLDOWN_SECONDS } from '@/lib/config'
import { buildRequest } from '@/tests/helpers/request-helper'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

const mockGetAuthenticatedSession = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthenticatedSession: mockGetAuthenticatedSession,
  }
})

const mockRedisExists = vi.hoisted(() => vi.fn())
const mockRedisTtl = vi.hoisted(() => vi.fn())
const mockRedisSet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/redis', () => ({
  redis: {
    exists: mockRedisExists,
    ttl: mockRedisTtl,
    set: mockRedisSet,
  },
  bullmqConnection: {},
}))

const mockQueueAdd = vi.hoisted(() => vi.fn())

vi.mock('@/lib/queue', () => ({
  queue: {
    add: mockQueueAdd,
  },
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
  mockRedisExists.mockReset()
  mockRedisTtl.mockReset()
  mockRedisSet.mockReset()
  mockQueueAdd.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }
const context = { params: Promise.resolve({ categoryId: 'cat-1' }) }

describe('POST /api/categories/[categoryId]/poll', () => {
  let POST: typeof import('./route').POST

  beforeEach(async () => {
    const mod = await import('./route')
    POST = mod.POST
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    const response = await POST(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが存在しない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    const response = await POST(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('クォータ枯渇の場合 503 QUOTA_EXHAUSTED を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockRedisExists.mockResolvedValue(1) // quota exhausted
    mockRedisTtl.mockResolvedValue(-2)

    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    const response = await POST(request, context)

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('QUOTA_EXHAUSTED')
  })

  it('クールダウン中の場合 429 POLLING_COOLDOWN を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockRedisExists.mockResolvedValue(0) // no quota exhaustion
    mockRedisTtl.mockResolvedValue(180) // 180 seconds remaining

    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    const response = await POST(request, context)

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.error.code).toBe('POLLING_COOLDOWN')
    expect(body.error.retryAfter).toBe(180)
  })

  it('正常にキュー追加して queued: true を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockRedisExists.mockResolvedValue(0)
    mockRedisTtl.mockResolvedValue(-2) // no cooldown
    mockRedisSet.mockResolvedValue('OK')
    mockQueueAdd.mockResolvedValue(undefined)

    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    const response = await POST(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ queued: true })
  })

  it('Redis cooldown key を正しく SET する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockRedisExists.mockResolvedValue(0)
    mockRedisTtl.mockResolvedValue(-2)
    mockRedisSet.mockResolvedValue('OK')
    mockQueueAdd.mockResolvedValue(undefined)

    const request = buildRequest('/api/categories/cat-1/poll', { method: 'POST' })

    await POST(request, context)

    expect(mockRedisSet).toHaveBeenCalledWith(
      'manual-poll:cooldown:cat-1',
      '1',
      'EX',
      MANUAL_POLLING_COOLDOWN_SECONDS,
    )
  })
})
