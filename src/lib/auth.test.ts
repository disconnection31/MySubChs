import { Prisma, PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'

type MockPrisma = DeepMockProxy<PrismaClient>

vi.mock('@/lib/db', async () => {
  const { mockDeep: md } = await import('vitest-mock-extended')
  const mock = md<PrismaClient>()
  return { default: mock, prisma: mock }
})

vi.mock('@/lib/queue', () => ({
  queue: { add: vi.fn().mockResolvedValue(undefined) },
}))

async function getPrismaMock(): Promise<MockPrisma> {
  const mod = await vi.importMock<{ prisma: MockPrisma }>('@/lib/db')
  return mod.prisma
}

let prismaMock: MockPrisma

// signIn コールバックを取得するヘルパー
async function getSignInCallback() {
  const { authOptions } = await import('@/lib/auth')
  return authOptions.callbacks!.signIn! as (params: {
    account: Record<string, unknown> | null
    user: Record<string, unknown>
    profile?: Record<string, unknown>
    email?: Record<string, unknown>
    credentials?: Record<string, unknown>
  }) => Promise<boolean | string>
}

const baseAccount = {
  provider: 'google',
  providerAccountId: 'google-123',
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_at: 1234567890,
  token_type: 'Bearer',
  type: 'oauth',
}

describe('signIn コールバック', () => {
  beforeEach(async () => {
    prismaMock = await getPrismaMock()
    mockReset(prismaMock)
  })

  it('account が null の場合 false を返す', async () => {
    const signIn = await getSignInCallback()

    const result = await signIn({ account: null, user: {} })

    expect(result).toBe(false)
    expect(prismaMock.account.update).not.toHaveBeenCalled()
  })

  it('再認証時に access_token / expires_at / token_type / refresh_token を更新する', async () => {
    const signIn = await getSignInCallback()
    prismaMock.account.update.mockResolvedValue({} as never)

    await signIn({ account: baseAccount, user: {} })

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: 'google-123',
        },
      },
      data: {
        token_error: null,
        access_token: 'new-access-token',
        expires_at: 1234567890,
        token_type: 'Bearer',
        refresh_token: 'new-refresh-token',
      },
    })
  })

  it('refresh_token が返されなかった場合は既存値を維持する（data に含めない）', async () => {
    const signIn = await getSignInCallback()
    prismaMock.account.update.mockResolvedValue({} as never)

    const accountWithoutRefresh = { ...baseAccount, refresh_token: undefined }
    await signIn({ account: accountWithoutRefresh, user: {} })

    const updateCall = prismaMock.account.update.mock.calls[0][0]
    expect(updateCall.data).not.toHaveProperty('refresh_token')
  })

  it('初回ログイン時（P2025）はエラーを無視してサインインを継続する', async () => {
    const signIn = await getSignInCallback()
    const p2025Error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    })
    prismaMock.account.update.mockRejectedValue(p2025Error)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await signIn({ account: baseAccount, user: {} })

    expect(result).toBe(true)
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('P2025 以外の DB エラー時は console.error が呼ばれてサインインは継続する', async () => {
    const signIn = await getSignInCallback()
    const dbError = new Error('Connection refused')
    prismaMock.account.update.mockRejectedValue(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await signIn({ account: baseAccount, user: {} })

    expect(result).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[auth] Failed to update account tokens',
      dbError,
    )
    consoleSpy.mockRestore()
  })
})
