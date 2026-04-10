import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

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

describe('POST /api/notifications/subscriptions', () => {
  let POST: typeof import('./route').POST

  beforeEach(async () => {
    const mod = await import('./route')
    POST = mod.POST
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: { endpoint: 'https://push.example.com', p256dh: 'key', auth: 'auth' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('endpoint が欠落している場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: { p256dh: 'key', auth: 'auth' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'endpoint' })]),
    )
  })

  it('p256dh が欠落している場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: { endpoint: 'https://push.example.com', auth: 'auth' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'p256dh' })]),
    )
  })

  it('auth が欠落している場合 400 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: { endpoint: 'https://push.example.com', p256dh: 'key' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'auth' })]),
    )
  })

  it('新規登録で 201 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.upsert.mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      endpoint: 'https://push.example.com',
      p256dh: 'key',
      auth: 'auth',
      userAgent: null,
      createdAt: new Date(),
    } as never)

    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: { endpoint: 'https://push.example.com', p256dh: 'key', auth: 'auth' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.id).toBe('sub-1')
    expect(body.endpoint).toBe('https://push.example.com')
  })

  it('既存 endpoint で upsert して 201 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.upsert.mockResolvedValue({
      id: 'sub-1',
      userId: 'user-1',
      endpoint: 'https://push.example.com',
      p256dh: 'new-key',
      auth: 'new-auth',
      userAgent: 'TestBrowser',
      createdAt: new Date(),
    } as never)

    const request = buildRequest('/api/notifications/subscriptions', {
      method: 'POST',
      body: {
        endpoint: 'https://push.example.com',
        p256dh: 'new-key',
        auth: 'new-auth',
        userAgent: 'TestBrowser',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.id).toBe('sub-1')
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example.com' },
        update: expect.objectContaining({ p256dh: 'new-key', auth: 'new-auth' }),
        create: expect.objectContaining({ userId: 'user-1' }),
      }),
    )
  })
})
