import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

import { executeSetupJob } from './setup'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

vi.mock('@/lib/tokenRefresh', () => ({
  ensureValidToken: vi.fn(),
}))

vi.mock('@/lib/sync-channels', () => ({
  syncChannels: vi.fn(),
}))

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

async function getEnsureValidTokenMock() {
  const mod = await vi.importMock<{
    ensureValidToken: ReturnType<typeof vi.fn>
  }>('@/lib/tokenRefresh')
  return mod.ensureValidToken
}

async function getSyncChannelsMock() {
  const mod = await vi.importMock<{
    syncChannels: ReturnType<typeof vi.fn>
  }>('@/lib/sync-channels')
  return mod.syncChannels
}

describe('executeSetupJob', () => {
  let prismaMock: MockPrisma
  let ensureValidTokenMock: ReturnType<typeof vi.fn>
  let syncChannelsMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    ensureValidTokenMock = await getEnsureValidTokenMock()
    syncChannelsMock = await getSyncChannelsMock()
    mockReset(prismaMock)
    ensureValidTokenMock.mockReset()
    syncChannelsMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('executes channel sync when token is valid', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-123',
      refresh_token: 'refresh-token',
      access_token: 'access-token',
      expires_at: 9999999999,
      token_type: 'Bearer',
      scope: 'openid',
      id_token: null,
      session_state: null,
      token_error: null,
    })
    ensureValidTokenMock.mockResolvedValue({
      success: true,
      accessToken: 'valid-access-token',
    })
    syncChannelsMock.mockResolvedValue({
      added: 5,
      restored: 0,
      deactivated: 0,
      updated: 0,
    })

    await executeSetupJob('user-1')

    expect(ensureValidTokenMock).toHaveBeenCalledWith('user-1')
    expect(syncChannelsMock).toHaveBeenCalledWith('user-1', 'valid-access-token')
  })

  it('skips when token_error is already set on account', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-123',
      refresh_token: 'refresh-token',
      access_token: 'access-token',
      expires_at: 9999999999,
      token_type: 'Bearer',
      scope: 'openid',
      id_token: null,
      session_state: null,
      token_error: 'invalid_grant',
    })

    await executeSetupJob('user-1')

    expect(ensureValidTokenMock).not.toHaveBeenCalled()
    expect(syncChannelsMock).not.toHaveBeenCalled()
  })

  it('skips when ensureValidToken returns "Token previously failed"', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-123',
      refresh_token: 'refresh-token',
      access_token: 'access-token',
      expires_at: 9999999999,
      token_type: 'Bearer',
      scope: 'openid',
      id_token: null,
      session_state: null,
      token_error: null,
    })
    ensureValidTokenMock.mockResolvedValue({
      success: false,
      error: 'Token previously failed: invalid_grant',
    })

    await executeSetupJob('user-1')

    expect(syncChannelsMock).not.toHaveBeenCalled()
  })

  it('throws when token refresh fails (for BullMQ retry)', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-123',
      refresh_token: 'refresh-token',
      access_token: 'access-token',
      expires_at: 9999999999,
      token_type: 'Bearer',
      scope: 'openid',
      id_token: null,
      session_state: null,
      token_error: null,
    })
    ensureValidTokenMock.mockResolvedValue({
      success: false,
      error: 'Network error',
    })

    await expect(executeSetupJob('user-1')).rejects.toThrow(
      '[setup] Token refresh failed for userId=user-1: Network error',
    )

    expect(syncChannelsMock).not.toHaveBeenCalled()
  })

  it('proceeds when account is not found (no token_error check)', async () => {
    prismaMock.account.findFirst.mockResolvedValue(null)
    ensureValidTokenMock.mockResolvedValue({
      success: false,
      error: 'No Google account found for user',
    })

    await expect(executeSetupJob('user-1')).rejects.toThrow(
      '[setup] Token refresh failed for userId=user-1: No Google account found for user',
    )
  })
})
