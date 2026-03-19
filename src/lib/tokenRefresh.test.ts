import { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { ensureValidToken } from '@/lib/tokenRefresh'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

let prismaMock: MockPrisma

describe('ensureValidToken', () => {
  const userId = 'user-123'
  const baseAccount = {
    id: 'account-1',
    userId,
    type: 'oauth',
    provider: 'google',
    providerAccountId: 'google-123',
    access_token: 'old-access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    token_type: 'Bearer',
    id_token: null,
    session_state: null,
    scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
    token_error: null,
  }

  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    mockReset(prismaMock)
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    mockFetch.mockReset()
  })

  it('returns error when no Google account exists', async () => {
    prismaMock.account.findFirst.mockResolvedValue(null)

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'No Google account found for user',
    })
  })

  it('returns error when token_error is already set (skip refresh)', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      ...baseAccount,
      token_error: 'invalid_grant',
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'Token previously failed: invalid_grant',
    })
    // Should NOT attempt fetch
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns error when no refresh_token is available', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      ...baseAccount,
      refresh_token: null,
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'No refresh token available',
    })
  })

  it('returns current access_token when not expired', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      ...baseAccount,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // valid for 1 more hour
      access_token: 'still-valid-token',
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: true,
      accessToken: 'still-valid-token',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refreshes token successfully when expired', async () => {
    prismaMock.account.findFirst.mockResolvedValue(baseAccount)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
      }),
    })

    prismaMock.account.update.mockResolvedValue({
      ...baseAccount,
      access_token: 'new-access-token',
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: true,
      accessToken: 'new-access-token',
    })

    // Verify DB update was called with correct data
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        access_token: 'new-access-token',
        expires_at: expect.any(Number),
        token_error: null,
      },
    })
  })

  it('writes token_error on refresh failure (invalid_grant)', async () => {
    prismaMock.account.findFirst.mockResolvedValue(baseAccount)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    })

    prismaMock.account.update.mockResolvedValue({
      ...baseAccount,
      token_error: 'invalid_grant',
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'invalid_grant',
    })

    // Verify token_error was written to DB
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { token_error: 'invalid_grant' },
    })
  })

  it('does not write token_error on network error (transient failure)', async () => {
    prismaMock.account.findFirst.mockResolvedValue(baseAccount)

    mockFetch.mockRejectedValue(new Error('Network timeout'))

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'Network timeout',
    })

    // Should NOT write token_error for transient errors
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })

  it('uses http status code as error when no error field in response', async () => {
    prismaMock.account.findFirst.mockResolvedValue(baseAccount)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    prismaMock.account.update.mockResolvedValue({
      ...baseAccount,
      token_error: 'http_500',
    })

    const result = await ensureValidToken(userId)

    expect(result).toEqual({
      success: false,
      error: 'http_500',
    })

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { token_error: 'http_500' },
    })
  })
})
