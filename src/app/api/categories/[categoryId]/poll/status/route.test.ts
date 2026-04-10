import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockReset } from 'vitest-mock-extended'

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

const mockQueueGetJob = vi.hoisted(() => vi.fn())

vi.mock('@/lib/queue', () => ({
  queue: {
    getJob: mockQueueGetJob,
  },
}))

const mockRedisTtl = vi.hoisted(() => vi.fn())

vi.mock('@/lib/redis', () => ({
  redis: {
    ttl: mockRedisTtl,
  },
  bullmqConnection: {},
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
  mockQueueGetJob.mockReset()
  mockRedisTtl.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }
const context = { params: Promise.resolve({ categoryId: 'cat-1' }) }

describe('GET /api/categories/[categoryId]/poll/status', () => {
  let GET: typeof import('./route').GET

  beforeEach(async () => {
    const mod = await import('./route')
    GET = mod.GET
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/poll/status')

    const response = await GET(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('カテゴリが存在しない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue(null)
    const request = buildRequest('/api/categories/cat-1/poll/status')

    const response = await GET(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('ジョブなしの場合 status: none, cooldownRemaining: 0 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockQueueGetJob.mockResolvedValue(null)
    mockRedisTtl.mockResolvedValue(-2) // key does not exist

    const request = buildRequest('/api/categories/cat-1/poll/status')

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('none')
    expect(body.cooldownRemaining).toBe(0)
  })

  it('active ジョブの場合 status: active を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockQueueGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('active'),
    })
    mockRedisTtl.mockResolvedValue(120)

    const request = buildRequest('/api/categories/cat-1/poll/status')

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('active')
    expect(body.cooldownRemaining).toBe(120)
  })

  it('completed ジョブの場合 status: completed を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' } as never)
    mockQueueGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
    })
    mockRedisTtl.mockResolvedValue(-1)

    const request = buildRequest('/api/categories/cat-1/poll/status')

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('completed')
    expect(body.cooldownRemaining).toBe(0)
  })
})
