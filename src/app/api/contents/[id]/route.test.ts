import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockReset } from 'vitest-mock-extended'

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

const baseDate = new Date('2026-04-29T00:00:00.000Z')

function makeContentWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    id: 'content-1',
    channelId: 'ch-1',
    platform: 'youtube',
    platformContentId: 'vid_123',
    title: 'テスト動画',
    type: 'LIVE',
    status: 'LIVE',
    publishedAt: baseDate,
    scheduledStartAt: baseDate,
    actualStartAt: baseDate,
    actualEndAt: null,
    contentAt: baseDate,
    statusManuallySetAt: null,
    url: 'https://youtube.com/watch?v=vid_123',
    thumbnailUrl: null,
    durationSeconds: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    channel: {
      name: 'テストチャンネル',
      iconUrl: null,
    },
    watchLaters: [],
    ...overrides,
  }
}

describe('PATCH /api/contents/[id]', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/contents/content-1', {
      method: 'PATCH',
      body: { status: 'ARCHIVED' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-1' }),
    })

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('対象コンテンツが存在しない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findFirst.mockResolvedValue(null)

    const request = buildRequest('/api/contents/content-999', {
      method: 'PATCH',
      body: { status: 'ARCHIVED' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-999' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CONTENT_NOT_FOUND')
  })

  it('他ユーザー所有のコンテンツの場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    // findFirst は { id, channel: { userId } } 条件で検索するため、他ユーザー所有なら null
    prismaMock.content.findFirst.mockResolvedValue(null)

    const request = buildRequest('/api/contents/content-1', {
      method: 'PATCH',
      body: { status: 'ARCHIVED' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-1' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CONTENT_NOT_FOUND')
  })

  it('status 欠落で 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findFirst.mockResolvedValue({ id: 'content-1' } as never)

    const request = buildRequest('/api/contents/content-1', {
      method: 'PATCH',
      body: {},
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-1' }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('status が enum 外の値の場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findFirst.mockResolvedValue({ id: 'content-1' } as never)

    const request = buildRequest('/api/contents/content-1', {
      method: 'PATCH',
      body: { status: 'INVALID' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-1' }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('正常系: status と statusManuallySetAt が更新され、contentAt は変更されない', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.content.findFirst.mockResolvedValue({ id: 'content-1' } as never)

    const updated = makeContentWithRelations({
      status: 'ARCHIVED',
      statusManuallySetAt: new Date('2026-04-29T12:00:00.000Z'),
    })
    prismaMock.content.update.mockResolvedValue(updated as never)

    const request = buildRequest('/api/contents/content-1', {
      method: 'PATCH',
      body: { status: 'ARCHIVED' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'content-1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.id).toBe('content-1')
    expect(body.status).toBe('ARCHIVED')
    expect(body.statusManuallySetAt).toBe('2026-04-29T12:00:00.000Z')
    // contentAt はベースの値を保持（PATCH では更新しない）
    expect(body.contentAt).toBe(baseDate.toISOString())

    // update に渡されたデータをチェック: status と statusManuallySetAt のみ
    const updateCall = prismaMock.content.update.mock.calls[0]?.[0]
    expect(updateCall?.data).toEqual(
      expect.objectContaining({
        status: 'ARCHIVED',
        statusManuallySetAt: expect.any(Date),
      }),
    )
    expect(updateCall?.data).not.toHaveProperty('contentAt')
  })
})
