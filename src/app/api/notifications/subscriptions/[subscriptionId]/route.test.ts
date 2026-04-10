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
const context = { params: Promise.resolve({ subscriptionId: 'sub-1' }) }

describe('DELETE /api/notifications/subscriptions/[subscriptionId]', () => {
  let DELETE: typeof import('./route').DELETE

  beforeEach(async () => {
    const mod = await import('./route')
    DELETE = mod.DELETE
  })

  it('未認証の場合 401 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(null)
    const request = buildRequest('/api/notifications/subscriptions/sub-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, context)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('存在しないサブスクリプションの場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 } as never)

    const request = buildRequest('/api/notifications/subscriptions/sub-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('PUSH_SUBSCRIPTION_NOT_FOUND')
  })

  it('他ユーザーのサブスクリプションの場合 404 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    // deleteMany with userId filter returns count 0 for other user's subscription
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 } as never)

    const request = buildRequest('/api/notifications/subscriptions/sub-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, context)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('PUSH_SUBSCRIPTION_NOT_FOUND')
  })

  it('正常に削除して 204 を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 } as never)

    const request = buildRequest('/api/notifications/subscriptions/sub-1', {
      method: 'DELETE',
    })

    const response = await DELETE(request, context)

    expect(response.status).toBe(204)
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', userId: 'user-1' },
    })
  })
})
