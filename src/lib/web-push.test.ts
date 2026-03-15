import { describe, expect, it, vi } from 'vitest'

import { isSubscriptionGone, sendPushNotification } from '@/lib/web-push'

// Mock the web-push module
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

describe('web-push', () => {
  describe('isSubscriptionGone()', () => {
    it('statusCode 410 の場合 true を返す', () => {
      expect(isSubscriptionGone({ statusCode: 410 })).toBe(true)
    })

    it('statusCode 404 の場合 true を返す', () => {
      expect(isSubscriptionGone({ statusCode: 404 })).toBe(true)
    })

    it('statusCode 500 の場合 false を返す', () => {
      expect(isSubscriptionGone({ statusCode: 500 })).toBe(false)
    })

    it('statusCode 403 の場合 false を返す', () => {
      expect(isSubscriptionGone({ statusCode: 403 })).toBe(false)
    })

    it('statusCode がない場合 false を返す', () => {
      expect(isSubscriptionGone(new Error('network error'))).toBe(false)
    })

    it('null の場合 false を返す', () => {
      expect(isSubscriptionGone(null)).toBe(false)
    })

    it('undefined の場合 false を返す', () => {
      expect(isSubscriptionGone(undefined)).toBe(false)
    })

    it('文字列の場合 false を返す', () => {
      expect(isSubscriptionGone('error')).toBe(false)
    })

    it('statusCode が文字列の場合 false を返す', () => {
      expect(isSubscriptionGone({ statusCode: '410' })).toBe(false)
    })
  })

  describe('sendPushNotification()', () => {
    it('送信成功時に true を返す', async () => {
      const webPush = await import('web-push')
      vi.mocked(webPush.default.sendNotification).mockResolvedValueOnce({} as never)

      const result = await sendPushNotification(
        { endpoint: 'https://example.com/push', keys: { p256dh: 'key', auth: 'auth' } },
        { title: 'Test', body: 'Body' },
      )

      expect(result).toBe(true)
    })

    it('410 エラー時に false を返す（再スローしない）', async () => {
      const webPush = await import('web-push')
      vi.mocked(webPush.default.sendNotification).mockRejectedValueOnce({ statusCode: 410 })

      const result = await sendPushNotification(
        { endpoint: 'https://example.com/push', keys: { p256dh: 'key', auth: 'auth' } },
        { title: 'Test', body: 'Body' },
      )

      expect(result).toBe(false)
    })

    it('404 エラー時に false を返す（再スローしない）', async () => {
      const webPush = await import('web-push')
      vi.mocked(webPush.default.sendNotification).mockRejectedValueOnce({ statusCode: 404 })

      const result = await sendPushNotification(
        { endpoint: 'https://example.com/push', keys: { p256dh: 'key', auth: 'auth' } },
        { title: 'Test', body: 'Body' },
      )

      expect(result).toBe(false)
    })

    it('その他のエラー時は再スローする', async () => {
      const webPush = await import('web-push')
      const error = { statusCode: 500, message: 'Internal Server Error' }
      vi.mocked(webPush.default.sendNotification).mockRejectedValueOnce(error)

      await expect(
        sendPushNotification(
          { endpoint: 'https://example.com/push', keys: { p256dh: 'key', auth: 'auth' } },
          { title: 'Test', body: 'Body' },
        ),
      ).rejects.toEqual(error)
    })
  })
})
