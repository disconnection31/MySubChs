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

describe('PATCH /api/channels/[channelId]', () => {
  let PATCH: typeof import('./route').PATCH

  beforeEach(async () => {
    const mod = await import('./route')
    PATCH = mod.PATCH
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/channels/ch-1', {
      method: 'PATCH',
      body: { categoryId: 'cat-2' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ channelId: 'ch-1' }),
    })

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('更新フィールドが指定されていない場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/channels/ch-1', {
      method: 'PATCH',
      body: {},
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ channelId: 'ch-1' }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('チャンネルが見つからない場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.channel.findUnique.mockResolvedValue(null)

    const request = buildRequest('/api/channels/ch-999', {
      method: 'PATCH',
      body: { categoryId: 'cat-2' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ channelId: 'ch-999' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('CHANNEL_NOT_FOUND')
  })

  it('チャンネルの categoryId を正常に更新する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const channel = makeChannel()
    prismaMock.channel.findUnique.mockResolvedValue(channel as never)
    prismaMock.category.findUnique.mockResolvedValue({
      id: 'cat-2',
      userId: 'user-1',
      name: 'カテゴリ2',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as never)
    const updatedChannel = makeChannel({ categoryId: 'cat-2' })
    prismaMock.channel.update.mockResolvedValue(updatedChannel as never)

    const request = buildRequest('/api/channels/ch-1', {
      method: 'PATCH',
      body: { categoryId: 'cat-2' },
    })

    const response = await PATCH(request, {
      params: Promise.resolve({ channelId: 'ch-1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.categoryId).toBe('cat-2')
    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ch-1' },
        data: expect.objectContaining({
          category: { connect: { id: 'cat-2' } },
        }),
      }),
    )
  })
})
