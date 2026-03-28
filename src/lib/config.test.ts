import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CONTENT_RETENTION_DAYS,
  DEFAULT_POLLING_INTERVAL_MINUTES,
  DEV_USER_EMAIL,
  DEV_USER_ID,
  DEV_USER_IMAGE,
  DEV_USER_NAME,
  MANUAL_POLLING_COOLDOWN_SECONDS,
  VALID_POLLING_INTERVALS,
  YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS,
  YOUTUBE_QUOTA_COST_CHANNELS,
  YOUTUBE_QUOTA_COST_PLAYLIST_ITEMS,
  YOUTUBE_QUOTA_COST_SEARCH,
  YOUTUBE_QUOTA_COST_SUBSCRIPTIONS,
  YOUTUBE_QUOTA_COST_VIDEOS,
  YOUTUBE_QUOTA_DAILY_LIMIT,
  YOUTUBE_QUOTA_WARNING_THRESHOLD,
  isDevBypassAuth,
} from '@/lib/config'

describe('config', () => {
  describe('UserSetting デフォルト値', () => {
    it('DEFAULT_POLLING_INTERVAL_MINUTES は 30 である', () => {
      expect(DEFAULT_POLLING_INTERVAL_MINUTES).toBe(30)
    })

    it('DEFAULT_CONTENT_RETENTION_DAYS は 60 である', () => {
      expect(DEFAULT_CONTENT_RETENTION_DAYS).toBe(60)
    })
  })

  describe('YouTube API クォータ', () => {
    it('YOUTUBE_QUOTA_DAILY_LIMIT は 10000 である', () => {
      expect(YOUTUBE_QUOTA_DAILY_LIMIT).toBe(10_000)
    })

    it('YOUTUBE_QUOTA_WARNING_THRESHOLD は 9000 である', () => {
      expect(YOUTUBE_QUOTA_WARNING_THRESHOLD).toBe(9_000)
    })

    it('YOUTUBE_QUOTA_WARNING_THRESHOLD は YOUTUBE_QUOTA_DAILY_LIMIT より小さい', () => {
      expect(YOUTUBE_QUOTA_WARNING_THRESHOLD).toBeLessThan(YOUTUBE_QUOTA_DAILY_LIMIT)
    })
  })

  describe('YouTube API エンドポイント別クォータコスト', () => {
    it('YOUTUBE_QUOTA_COST_PLAYLIST_ITEMS は 1 である', () => {
      expect(YOUTUBE_QUOTA_COST_PLAYLIST_ITEMS).toBe(1)
    })

    it('YOUTUBE_QUOTA_COST_VIDEOS は 1 である', () => {
      expect(YOUTUBE_QUOTA_COST_VIDEOS).toBe(1)
    })

    it('YOUTUBE_QUOTA_COST_CHANNELS は 1 である', () => {
      expect(YOUTUBE_QUOTA_COST_CHANNELS).toBe(1)
    })

    it('YOUTUBE_QUOTA_COST_SUBSCRIPTIONS は 1 である', () => {
      expect(YOUTUBE_QUOTA_COST_SUBSCRIPTIONS).toBe(1)
    })

    it('YOUTUBE_QUOTA_COST_SEARCH は 100 である（使用禁止）', () => {
      expect(YOUTUBE_QUOTA_COST_SEARCH).toBe(100)
    })
  })

  describe('YouTube API その他の定数', () => {
    it('YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS は 50 である', () => {
      expect(YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS).toBe(50)
    })
  })

  describe('手動ポーリングのクールダウン', () => {
    it('MANUAL_POLLING_COOLDOWN_SECONDS は 300（5分）である', () => {
      expect(MANUAL_POLLING_COOLDOWN_SECONDS).toBe(300)
    })
  })

  describe('VALID_POLLING_INTERVALS', () => {
    it('[5, 10, 30, 60] の値を含む', () => {
      expect(VALID_POLLING_INTERVALS).toEqual([5, 10, 30, 60])
    })

    it('4つの有効な間隔値を持つ', () => {
      expect(VALID_POLLING_INTERVALS).toHaveLength(4)
    })
  })

  describe('UIプレビューモード定数', () => {
    it('DEV_USER_ID は固定UUIDである', () => {
      expect(DEV_USER_ID).toBe('00000000-0000-4000-a000-000000000001')
    })

    it('DEV_USER_EMAIL は dev@example.com である', () => {
      expect(DEV_USER_EMAIL).toBe('dev@example.com')
    })

    it('DEV_USER_NAME は Dev User である', () => {
      expect(DEV_USER_NAME).toBe('Dev User')
    })

    it('DEV_USER_IMAGE はプレースホルダーアバターのパスである', () => {
      expect(DEV_USER_IMAGE).toBe('/images/placeholder-avatar.svg')
    })
  })

  describe('isDevBypassAuth', () => {
    const originalEnv = process.env

    afterEach(() => {
      process.env = originalEnv
      vi.unstubAllEnvs()
    })

    it('DEV_BYPASS_AUTH=true かつ NODE_ENV !== production で true を返す', () => {
      vi.stubEnv('DEV_BYPASS_AUTH', 'true')
      vi.stubEnv('NODE_ENV', 'development')
      expect(isDevBypassAuth()).toBe(true)
    })

    it('DEV_BYPASS_AUTH=true かつ NODE_ENV=test で true を返す', () => {
      vi.stubEnv('DEV_BYPASS_AUTH', 'true')
      vi.stubEnv('NODE_ENV', 'test')
      expect(isDevBypassAuth()).toBe(true)
    })

    it('DEV_BYPASS_AUTH=true かつ NODE_ENV=production で false を返す（二重ガード）', () => {
      vi.stubEnv('DEV_BYPASS_AUTH', 'true')
      vi.stubEnv('NODE_ENV', 'production')
      expect(isDevBypassAuth()).toBe(false)
    })

    it('DEV_BYPASS_AUTH が未設定の場合 false を返す', () => {
      vi.stubEnv('DEV_BYPASS_AUTH', '')
      vi.stubEnv('NODE_ENV', 'development')
      expect(isDevBypassAuth()).toBe(false)
    })

    it('DEV_BYPASS_AUTH=false の場合 false を返す', () => {
      vi.stubEnv('DEV_BYPASS_AUTH', 'false')
      vi.stubEnv('NODE_ENV', 'development')
      expect(isDevBypassAuth()).toBe(false)
    })
  })
})
