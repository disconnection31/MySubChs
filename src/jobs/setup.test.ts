import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeSetupJob } from './setup'

vi.mock('@/lib/tokenRefresh', () => ({
  ensureValidToken: vi.fn(),
}))

vi.mock('@/lib/sync-channels', () => ({
  syncChannels: vi.fn(),
}))

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
  let ensureValidTokenMock: ReturnType<typeof vi.fn>
  let syncChannelsMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    ensureValidTokenMock = await getEnsureValidTokenMock()
    syncChannelsMock = await getSyncChannelsMock()
    ensureValidTokenMock.mockReset()
    syncChannelsMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('executes channel sync when token is valid', async () => {
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

  it('skips when ensureValidToken returns "Token previously failed"', async () => {
    ensureValidTokenMock.mockResolvedValue({
      success: false,
      error: 'Token previously failed: invalid_grant',
    })

    await executeSetupJob('user-1')

    expect(syncChannelsMock).not.toHaveBeenCalled()
  })

  it('throws when token refresh fails (for BullMQ retry)', async () => {
    ensureValidTokenMock.mockResolvedValue({
      success: false,
      error: 'Network error',
    })

    await expect(executeSetupJob('user-1')).rejects.toThrow(
      '[setup] Token refresh failed for userId=user-1: Network error',
    )

    expect(syncChannelsMock).not.toHaveBeenCalled()
  })
})
