import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockReset } from 'vitest-mock-extended'

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

const mockSendPushNotification = vi.hoisted(() => vi.fn())

vi.mock('@/lib/web-push', () => ({
  sendPushNotification: mockSendPushNotification,
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
  mockSendPushNotification.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }

describe('POST /api/notifications/test', () => {
  let POST: typeof import('./route').POST

  beforeEach(async () => {
    const mod = await import('./route')
    POST = mod.POST
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('サブスクリプションが 0 件の場合 sent: 0, failed: 0 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.findMany.mockResolvedValue([])

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ sent: 0, failed: 0 })
    expect(mockSendPushNotification).not.toHaveBeenCalled()
  })

  it('全件送信成功の場合 sent: N, failed: 0 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
        createdAt: new Date(),
        userAgent: null,
      },
      {
        id: 'sub-2',
        userId: 'user-1',
        endpoint: 'https://push.example.com/sub2',
        p256dh: 'key2',
        auth: 'auth2',
        createdAt: new Date(),
        userAgent: null,
      },
    ] as never)

    mockSendPushNotification.mockResolvedValue(true)

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ sent: 2, failed: 0 })
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2)
  })

  it('一部失敗の場合 expired サブスクリプションを削除する', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
        createdAt: new Date(),
        userAgent: null,
      },
      {
        id: 'sub-2',
        userId: 'user-1',
        endpoint: 'https://push.example.com/sub2',
        p256dh: 'key2',
        auth: 'auth2',
        createdAt: new Date(),
        userAgent: null,
      },
    ] as never)

    // sub-1 succeeds, sub-2 returns false (expired)
    mockSendPushNotification
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ sent: 1, failed: 1 })
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub-2'] } },
    })
  })
})
