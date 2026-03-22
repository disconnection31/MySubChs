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

describe('PUT /api/watch-later/[contentId]', () => {
  let PUT: typeof import('./route').PUT

  beforeEach(async () => {
    const mod = await import('./route')
    PUT = mod.PUT
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/watch-later/content-1', {
      method: 'PUT',
    })

    const response = await PUT(request, {
      params: Promise.resolve({ contentId: 'content-1' }),
    })

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('コンテンツが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findUnique.mockResolvedValue(null)

    const request = buildRequest('/api/watch-later/content-999', {
      method: 'PUT',
    })

    const response = await PUT(request, {
      params: Promise.resolve({ contentId: 'content-999' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CONTENT_NOT_FOUND')
  })

  it('「後で見る」エントリを正常に作成する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findUnique.mockResolvedValue({
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
      channel: { userId: 'user-1' },
    } as never)

    const watchLater = {
      id: 'wl-1',
      userId: 'user-1',
      contentId: 'content-1',
      addedVia: 'MANUAL',
      removedVia: null,
      expiresAt: null,
      addedAt: now,
      createdAt: now,
      updatedAt: now,
    }
    prismaMock.watchLater.upsert.mockResolvedValue(watchLater as never)

    const request = buildRequest('/api/watch-later/content-1', {
      method: 'PUT',
    })

    const response = await PUT(request, {
      params: Promise.resolve({ contentId: 'content-1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.addedVia).toBe('MANUAL')
    expect(body.expiresAt).toBeNull()
    expect(body.addedAt).toBe(now.toISOString())
  })
})

describe('DELETE /api/watch-later/[contentId]', () => {
  let DELETE: typeof import('./route').DELETE

  beforeEach(async () => {
    const mod = await import('./route')
    DELETE = mod.DELETE
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/watch-later/content-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, {
      params: Promise.resolve({ contentId: 'content-1' }),
    })

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('「後で見る」レコードが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.watchLater.findUnique.mockResolvedValue(null)

    const request = buildRequest('/api/watch-later/content-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, {
      params: Promise.resolve({ contentId: 'content-1' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CONTENT_NOT_FOUND')
  })

  it('ソフト削除して 204 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.watchLater.findUnique.mockResolvedValue({
      id: 'wl-1',
      userId: 'user-1',
      contentId: 'content-1',
      addedVia: 'MANUAL',
      removedVia: null,
      expiresAt: null,
      addedAt: now,
      createdAt: now,
      updatedAt: now,
    } as never)
    prismaMock.watchLater.update.mockResolvedValue({} as never)

    const request = buildRequest('/api/watch-later/content-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, {
      params: Promise.resolve({ contentId: 'content-1' }),
    })

    expect(response.status).toBe(204)
    expect(prismaMock.watchLater.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { removedVia: 'MANUAL' },
      }),
    )
  })
})
