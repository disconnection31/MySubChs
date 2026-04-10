import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

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

const mockSyncChannels = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sync-channels', () => ({
  syncChannels: mockSyncChannels,
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
  mockSyncChannels.mockReset()
})

const mockAuth = { userId: 'user-1', session: { user: { id: 'user-1' } } }

describe('POST /api/settings/sync-channels', () => {
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

  it('access_token が null の場合 503 OAUTH_TOKEN_INVALID を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.account.findFirst.mockResolvedValue({
      access_token: null,
      token_error: null,
    } as never)

    const response = await POST()

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('OAUTH_TOKEN_INVALID')
  })

  it('token_error が設定済みの場合 503 OAUTH_TOKEN_INVALID を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.account.findFirst.mockResolvedValue({
      access_token: 'valid-token',
      token_error: 'refresh_failed',
    } as never)

    const response = await POST()

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('OAUTH_TOKEN_INVALID')
  })

  it('YouTubeAuthError の場合 503 OAUTH_TOKEN_INVALID を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.account.findFirst.mockResolvedValue({
      access_token: 'valid-token',
      token_error: null,
    } as never)

    // Import the error class to throw a proper instance
    const { YouTubeAuthError } = await import('@/lib/platforms/youtube')
    mockSyncChannels.mockRejectedValue(new YouTubeAuthError('Token invalid'))

    const response = await POST()

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('OAUTH_TOKEN_INVALID')
  })

  it('YouTubeQuotaExceededError の場合 503 YOUTUBE_API_ERROR を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.account.findFirst.mockResolvedValue({
      access_token: 'valid-token',
      token_error: null,
    } as never)

    const { YouTubeQuotaExceededError } = await import('@/lib/platforms/youtube')
    mockSyncChannels.mockRejectedValue(new YouTubeQuotaExceededError())

    const response = await POST()

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('YOUTUBE_API_ERROR')
  })

  it('同期成功の場合 結果を返す', async () => {
    mockGetAuthenticatedSession.mockResolvedValue(mockAuth)
    prismaMock.account.findFirst.mockResolvedValue({
      access_token: 'valid-token',
      token_error: null,
    } as never)

    const syncResult = { added: 3, restored: 1, deactivated: 2, updated: 5 }
    mockSyncChannels.mockResolvedValue(syncResult)

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(syncResult)
    expect(mockSyncChannels).toHaveBeenCalledWith('user-1', 'valid-token')
  })
})
