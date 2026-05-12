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

function makeContentWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    id: 'content-1',
    channelId: 'ch-1',
    platform: 'YOUTUBE',
    platformContentId: 'vid_123',
    title: 'テスト動画',
    type: 'VIDEO',
    status: 'ARCHIVED',
    publishedAt: now,
    scheduledStartAt: null,
    actualStartAt: null,
    actualEndAt: null,
    contentAt: now,
    url: 'https://youtube.com/watch?v=vid_123',
    createdAt: now,
    updatedAt: now,
    channel: {
      name: 'テストチャンネル',
      iconUrl: 'https://example.com/icon.png',
    },
    watchLaters: [],
    ...overrides,
  }
}

describe('GET /api/contents', () => {
  let GET: typeof import('./route').GET

  beforeEach(async () => {
    const mod = await import('./route')
    GET = mod.GET
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/contents', {
      searchParams: { categoryId: 'cat-1' },
    })

    const response = await GET(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('categoryId が未指定の場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/contents')

    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('カテゴリにチャンネルがない場合に空データを返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.channel.findMany.mockResolvedValue([])

    const request = buildRequest('/api/contents', {
      searchParams: { categoryId: 'cat-1' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual([])
    expect(body.meta).toEqual({ hasNext: false, nextCursor: null })
  })

  it('コンテンツ一覧をページネーションメタ付きで返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }] as never)

    const contents = [makeContentWithRelations()]
    prismaMock.content.findMany.mockResolvedValue(contents as never)

    const request = buildRequest('/api/contents', {
      searchParams: { categoryId: 'cat-1' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('content-1')
    expect(body.data[0].title).toBe('テスト動画')
    expect(body.data[0].channel.name).toBe('テストチャンネル')
    expect(body.meta.hasNext).toBe(false)
    expect(body.meta.nextCursor).toBeNull()
  })

  it('不正なカーソルの場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

    const request = buildRequest('/api/contents', {
      searchParams: { categoryId: 'cat-1', cursor: 'invalid-cursor' },
    })
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('INVALID_CURSOR')
  })

  describe('status クエリパラメータ', () => {
    it('status=LIVE を指定すると where.status = { in: ["LIVE"] } で絞り込む', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
      prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }] as never)
      prismaMock.content.findMany.mockResolvedValue([] as never)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: 'LIVE' },
      })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const findManyCall = prismaMock.content.findMany.mock.calls[0]?.[0]
      expect(findManyCall?.where).toMatchObject({ status: { in: ['LIVE'] } })
    })

    it('status=LIVE,UPCOMING を指定すると where.status = { in: ["LIVE", "UPCOMING"] } で絞り込む', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
      prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }] as never)
      prismaMock.content.findMany.mockResolvedValue([] as never)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: 'LIVE,UPCOMING' },
      })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const findManyCall = prismaMock.content.findMany.mock.calls[0]?.[0]
      expect(findManyCall?.where).toMatchObject({ status: { in: ['LIVE', 'UPCOMING'] } })
    })

    it('status に CANCELLED を含む場合 400 を返す', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: 'LIVE,CANCELLED' },
      })
      const response = await GET(request)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('status に不正値を含む場合 400 を返す', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: 'INVALID' },
      })
      const response = await GET(request)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('status= 空文字列の場合は未指定扱いで 200', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
      prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }] as never)
      prismaMock.content.findMany.mockResolvedValue([] as never)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: '' },
      })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const findManyCall = prismaMock.content.findMany.mock.calls[0]?.[0]
      // status 指定なし + includeCancelled=false（デフォルト） → status: { not: 'CANCELLED' }
      expect(findManyCall?.where).toMatchObject({ status: { not: 'CANCELLED' } })
    })

    it('status 指定時は includeCancelled=false の影響を受けず in:[...] が優先される', async () => {
      mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
      prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }] as never)
      prismaMock.content.findMany.mockResolvedValue([] as never)

      const request = buildRequest('/api/contents', {
        searchParams: { categoryId: 'cat-1', status: 'ARCHIVED' },
      })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const findManyCall = prismaMock.content.findMany.mock.calls[0]?.[0]
      expect(findManyCall?.where).toMatchObject({ status: { in: ['ARCHIVED'] } })
      // status: { not: 'CANCELLED' } が設定されていないことを確認
      expect((findManyCall?.where as { status: unknown }).status).not.toMatchObject({
        not: 'CANCELLED',
      })
    })
  })
})
