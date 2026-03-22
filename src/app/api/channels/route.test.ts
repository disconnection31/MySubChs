import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

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

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    userId: 'user-1',
    platform: 'YOUTUBE',
    platformChannelId: 'UC_test123',
    name: 'テストチャンネル',
    iconUrl: 'https://example.com/icon.png',
    categoryId: 'cat-1',
    isActive: true,
    uploadsPlaylistId: 'UU_test123',
    lastPolledAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('GET /api/channels', () => {
  let GET: typeof import('./route').GET

  beforeEach(async () => {
    const mod = await import('./route')
    GET = mod.GET
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/channels')

    const response = await GET(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('チャンネル一覧を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

    const channels = [
      makeChannel({ id: 'ch-1', name: 'チャンネルA' }),
      makeChannel({ id: 'ch-2', name: 'チャンネルB' }),
    ]
    prismaMock.channel.findMany.mockResolvedValue(channels as never)

    const request = buildRequest('/api/channels')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('ch-1')
    expect(body[0].name).toBe('チャンネルA')
    expect(body[0].platform).toBe('YOUTUBE')
    expect(body[0].isActive).toBe(true)
    expect(body[0].createdAt).toBe(now.toISOString())
  })

  it('categoryId でフィルタリングする', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.channel.findMany.mockResolvedValue([makeChannel()] as never)

    const request = buildRequest('/api/channels', {
      searchParams: { categoryId: 'cat-1' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat-1' }),
      }),
    )
  })

  it('categoryId が "uncategorized" の場合 categoryId を null に設定する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.channel.findMany.mockResolvedValue([] as never)

    const request = buildRequest('/api/channels', {
      searchParams: { categoryId: 'uncategorized' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: null }),
      }),
    )
  })
})
