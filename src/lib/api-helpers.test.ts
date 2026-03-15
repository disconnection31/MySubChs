import { type Session } from 'next-auth'
import { describe, expect, it, vi } from 'vitest'

import {
  decodeCursor,
  getAuthenticatedSession,
  isValidAutoExpireHours,
  isValidPollingInterval,
} from '@/lib/api-helpers'

// next-auth の getServerSession をモックする
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

// @/lib/auth の authOptions をモックする
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

describe('api-helpers', () => {
  describe('getAuthenticatedSession()', () => {
    it('認証済みセッションがある場合に session と userId を返す', async () => {
      const { getServerSession } = await import('next-auth')
      const mockSession = {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: '2026-12-31',
      }
      vi.mocked(getServerSession).mockResolvedValue(mockSession)

      const result = await getAuthenticatedSession()

      expect(result).not.toBeNull()
      expect(result?.userId).toBe('user-123')
      expect(result?.session).toEqual(mockSession)
    })

    it('getServerSession が null を返す場合に null を返す', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      const result = await getAuthenticatedSession()

      expect(result).toBeNull()
    })

    it('セッションに user.id がない場合に null を返す', async () => {
      const { getServerSession } = await import('next-auth')
      const mockSession = {
        user: { email: 'test@example.com', name: 'Test User' },
        expires: '2026-12-31',
      }
      vi.mocked(getServerSession).mockResolvedValue(mockSession as unknown as Session)

      const result = await getAuthenticatedSession()

      expect(result).toBeNull()
    })
  })

  describe('isValidPollingInterval()', () => {
    it('有効な値 5 で true を返す', () => {
      expect(isValidPollingInterval(5)).toBe(true)
    })

    it('有効な値 10 で true を返す', () => {
      expect(isValidPollingInterval(10)).toBe(true)
    })

    it('有効な値 30 で true を返す', () => {
      expect(isValidPollingInterval(30)).toBe(true)
    })

    it('有効な値 60 で true を返す', () => {
      expect(isValidPollingInterval(60)).toBe(true)
    })

    it('無効な値 15 で false を返す', () => {
      expect(isValidPollingInterval(15)).toBe(false)
    })

    it('無効な値 0 で false を返す', () => {
      expect(isValidPollingInterval(0)).toBe(false)
    })

    it('文字列 "30" で false を返す（型が異なる）', () => {
      expect(isValidPollingInterval('30')).toBe(false)
    })

    it('null で false を返す', () => {
      expect(isValidPollingInterval(null)).toBe(false)
    })

    it('undefined で false を返す', () => {
      expect(isValidPollingInterval(undefined)).toBe(false)
    })
  })

  describe('isValidAutoExpireHours()', () => {
    it('有効な値 24 で true を返す', () => {
      expect(isValidAutoExpireHours(24)).toBe(true)
    })

    it('有効な値 72 で true を返す', () => {
      expect(isValidAutoExpireHours(72)).toBe(true)
    })

    it('有効な値 168 で true を返す', () => {
      expect(isValidAutoExpireHours(168)).toBe(true)
    })

    it('有効な値 336 で true を返す', () => {
      expect(isValidAutoExpireHours(336)).toBe(true)
    })

    it('無効な値 48 で false を返す', () => {
      expect(isValidAutoExpireHours(48)).toBe(false)
    })

    it('無効な値 0 で false を返す', () => {
      expect(isValidAutoExpireHours(0)).toBe(false)
    })

    it('文字列 "24" で false を返す（型が異なる）', () => {
      expect(isValidAutoExpireHours('24')).toBe(false)
    })

    it('null で false を返す', () => {
      expect(isValidAutoExpireHours(null)).toBe(false)
    })

    it('undefined で false を返す', () => {
      expect(isValidAutoExpireHours(undefined)).toBe(false)
    })
  })

  describe('decodeCursor()', () => {
    it('正常な Base64 をデコードできる', () => {
      const cursor = { contentAt: '2026-01-01T00:00:00.000Z', id: 'content-123' }
      const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64')

      const result = decodeCursor(encoded)

      expect(result).toEqual(cursor)
    })

    it('不正な Base64 文字列で null を返す', () => {
      const result = decodeCursor('!!!invalid-base64!!!')

      expect(result).toBeNull()
    })

    it('Base64 だが JSON でない文字列で null を返す', () => {
      const notJson = Buffer.from('not-json-string').toString('base64')

      const result = decodeCursor(notJson)

      expect(result).toBeNull()
    })

    it('JSON だが必要なフィールドがない場合に null を返す', () => {
      const missingFields = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64')

      const result = decodeCursor(missingFields)

      expect(result).toBeNull()
    })

    it('contentAt はあるが id がない場合に null を返す', () => {
      const partial = Buffer.from(JSON.stringify({ contentAt: '2026-01-01T00:00:00.000Z' })).toString('base64')

      const result = decodeCursor(partial)

      expect(result).toBeNull()
    })

    it('id はあるが contentAt がない場合に null を返す', () => {
      const partial = Buffer.from(JSON.stringify({ id: 'content-123' })).toString('base64')

      const result = decodeCursor(partial)

      expect(result).toBeNull()
    })

    it('空文字列で null を返す', () => {
      const result = decodeCursor('')

      expect(result).toBeNull()
    })
  })
})
