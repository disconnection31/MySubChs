import { describe, it, expect, vi } from 'vitest'
import { ContentStatus, ContentType } from '@prisma/client'

import type { VideoDetail } from '@/lib/platforms/base'
import {
  calculateQuotaExhaustedTTL,
  determineNewContentFields,
  determineExistingLiveUpdate,
  determineExistingUpcomingUpdate,
  stripStatusFields,
} from './polling'

describe('polling', () => {
  describe('calculateQuotaExhaustedTTL', () => {
    it('returns TTL in seconds until next UTC midnight', () => {
      // Use a fixed date: 2026-03-22T15:30:00Z
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-22T15:30:00.000Z'))

      const { ttlSeconds, expiresAt } = calculateQuotaExhaustedTTL()

      // From 15:30 UTC to 00:00 UTC next day = 8.5 hours = 30600 seconds
      expect(ttlSeconds).toBe(30600)
      expect(expiresAt).toBe('2026-03-23T00:00:00.000Z')

      vi.useRealTimers()
    })

    it('returns small TTL near midnight', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-22T23:59:00.000Z'))

      const { ttlSeconds, expiresAt } = calculateQuotaExhaustedTTL()

      expect(ttlSeconds).toBe(60)
      expect(expiresAt).toBe('2026-03-23T00:00:00.000Z')

      vi.useRealTimers()
    })
  })

  describe('determineNewContentFields', () => {
    const now = new Date('2026-03-22T12:00:00.000Z')
    const channelId = 'channel-1'

    it('upcoming → LIVE/UPCOMING with scheduledStartAt as contentAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-1',
        title: 'Upcoming Stream',
        liveBroadcastContent: 'upcoming',
        publishedAt: '2026-03-22T10:00:00Z',
        scheduledStartTime: '2026-03-23T18:00:00Z',
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.LIVE)
      expect(result.status).toBe(ContentStatus.UPCOMING)
      expect(result.scheduledStartAt).toEqual(new Date('2026-03-23T18:00:00Z'))
      expect(result.contentAt).toEqual(new Date('2026-03-23T18:00:00Z'))
      expect(result.actualStartAt).toBeNull()
      expect(result.url).toBe('https://www.youtube.com/watch?v=vid-1')
    })

    it('upcoming without scheduledStartTime falls back to now', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-1',
        title: 'Upcoming Stream',
        liveBroadcastContent: 'upcoming',
        publishedAt: null,
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.LIVE)
      expect(result.status).toBe(ContentStatus.UPCOMING)
      expect(result.scheduledStartAt).toEqual(now)
      expect(result.contentAt).toEqual(now)
    })

    it('live → LIVE/LIVE with actualStartAt as contentAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Live Now',
        liveBroadcastContent: 'live',
        publishedAt: '2026-03-22T10:00:00Z',
        scheduledStartTime: '2026-03-22T11:00:00Z',
        actualStartTime: '2026-03-22T11:05:00Z',
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.LIVE)
      expect(result.status).toBe(ContentStatus.LIVE)
      expect(result.actualStartAt).toEqual(new Date('2026-03-22T11:05:00Z'))
      expect(result.contentAt).toEqual(new Date('2026-03-22T11:05:00Z'))
      expect(result.scheduledStartAt).toEqual(new Date('2026-03-22T11:00:00Z'))
    })

    it('live without actualStartTime falls back to now', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Live Now',
        liveBroadcastContent: 'live',
        publishedAt: null,
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.LIVE)
      expect(result.status).toBe(ContentStatus.LIVE)
      expect(result.actualStartAt).toEqual(now)
      expect(result.contentAt).toEqual(now)
    })

    it('none with duration > 60s → VIDEO/ARCHIVED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-3',
        title: 'Regular Video',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 600,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.VIDEO)
      expect(result.status).toBe(ContentStatus.ARCHIVED)
      expect(result.publishedAt).toEqual(new Date('2026-03-20T08:00:00Z'))
      expect(result.contentAt).toEqual(new Date('2026-03-20T08:00:00Z'))
      expect(result.durationSeconds).toBe(600)
    })

    it('none with duration ≤ 60s → SHORT/ARCHIVED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-short',
        title: 'Short Video',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 30,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.SHORT)
      expect(result.status).toBe(ContentStatus.ARCHIVED)
      expect(result.durationSeconds).toBe(30)
    })

    it('none with duration exactly 60s → SHORT/ARCHIVED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-60',
        title: 'Exactly 60s',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 60,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.SHORT)
    })

    it('none with duration 61s → VIDEO/ARCHIVED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-61',
        title: 'Just Over 60s',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 61,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.VIDEO)
    })

    it('none with null duration → VIDEO/ARCHIVED (graceful fallback)', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-3',
        title: 'Regular Video',
        liveBroadcastContent: 'none',
        publishedAt: null,
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.type).toBe(ContentType.VIDEO)
      expect(result.status).toBe(ContentStatus.ARCHIVED)
      expect(result.publishedAt).toBeNull()
      expect(result.contentAt).toEqual(now)
    })

    it('thumbnailUrl がある場合、結果に引き継ぐ', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-thumb',
        title: 'Video with Thumbnail',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 300,
        thumbnailUrl: 'https://i.ytimg.com/vi/vid-thumb/mqdefault.jpg',
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.thumbnailUrl).toBe('https://i.ytimg.com/vi/vid-thumb/mqdefault.jpg')
    })

    it('thumbnailUrl が null の場合、結果も null', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-no-thumb',
        title: 'Video without Thumbnail',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-20T08:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: 300,
        thumbnailUrl: null,
      }

      const result = determineNewContentFields(detail, channelId, now)!

      expect(result.thumbnailUrl).toBeNull()
    })
  })

  describe('determineExistingLiveUpdate', () => {
    const existing = {
      id: 'content-1',
      platform: 'youtube',
      platformContentId: 'vid-1',
      channelId: 'channel-1',
      type: ContentType.LIVE,
      status: ContentStatus.LIVE,
      scheduledStartAt: new Date('2026-03-22T10:00:00Z'),
      actualStartAt: new Date('2026-03-22T10:05:00Z'),
      statusManuallySetAt: null,
    }

    it('detail not found → CANCELLED', () => {
      const result = determineExistingLiveUpdate(undefined, existing)

      expect(result).toEqual({ status: ContentStatus.CANCELLED })
    })

    it('none + actualEndTime → ARCHIVED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-1',
        title: 'Stream Ended',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-22T10:00:00Z',
        scheduledStartTime: null,
        actualStartTime: '2026-03-22T10:05:00Z',
        actualEndTime: '2026-03-22T12:00:00Z',
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingLiveUpdate(detail, existing)

      expect(result).toEqual({
        status: ContentStatus.ARCHIVED,
        actualEndAt: new Date('2026-03-22T12:00:00Z'),
        title: 'Stream Ended',
        thumbnailUrl: null,
      })
    })

    it('none + no actualEndTime → CANCELLED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-1',
        title: 'Stream Gone',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-22T10:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingLiveUpdate(detail, existing)

      expect(result).toEqual({
        status: ContentStatus.CANCELLED,
        title: 'Stream Gone',
        thumbnailUrl: null,
      })
    })

    it('still live → title and thumbnailUrl update', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-1',
        title: 'Updated Title',
        liveBroadcastContent: 'live',
        publishedAt: '2026-03-22T10:00:00Z',
        scheduledStartTime: null,
        actualStartTime: '2026-03-22T10:05:00Z',
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: 'https://i.ytimg.com/vi/vid-1/mqdefault.jpg',
      }

      const result = determineExistingLiveUpdate(detail, existing)

      expect(result).toEqual({
        title: 'Updated Title',
        thumbnailUrl: 'https://i.ytimg.com/vi/vid-1/mqdefault.jpg',
      })
    })
  })

  describe('determineExistingUpcomingUpdate', () => {
    const existing = {
      id: 'content-2',
      platform: 'youtube',
      platformContentId: 'vid-2',
      channelId: 'channel-1',
      type: ContentType.LIVE,
      status: ContentStatus.UPCOMING,
      scheduledStartAt: new Date('2026-03-22T10:00:00Z'),
      actualStartAt: null,
      statusManuallySetAt: null,
    }

    it('detail not found → CANCELLED', () => {
      const result = determineExistingUpcomingUpdate(undefined, existing)

      expect(result).toEqual({ status: ContentStatus.CANCELLED })
    })

    it('live → LIVE with actualStartAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Now Live!',
        liveBroadcastContent: 'live',
        publishedAt: '2026-03-22T09:00:00Z',
        scheduledStartTime: '2026-03-22T10:00:00Z',
        actualStartTime: '2026-03-22T10:02:00Z',
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingUpcomingUpdate(detail, existing)

      expect(result).toEqual({
        status: ContentStatus.LIVE,
        actualStartAt: new Date('2026-03-22T10:02:00Z'),
        contentAt: new Date('2026-03-22T10:02:00Z'),
        title: 'Now Live!',
        thumbnailUrl: null,
      })
    })

    it('live without actualStartTime falls back to scheduledStartAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Now Live!',
        liveBroadcastContent: 'live',
        publishedAt: null,
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingUpcomingUpdate(detail, existing)

      expect(result).toEqual({
        status: ContentStatus.LIVE,
        actualStartAt: new Date('2026-03-22T10:00:00Z'),
        contentAt: new Date('2026-03-22T10:00:00Z'),
        title: 'Now Live!',
        thumbnailUrl: null,
      })
    })

    it('upcoming (postponed) → update scheduledStartAt and contentAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Postponed Stream',
        liveBroadcastContent: 'upcoming',
        publishedAt: '2026-03-22T09:00:00Z',
        scheduledStartTime: '2026-03-23T14:00:00Z',
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingUpcomingUpdate(detail, existing)

      expect(result).toEqual({
        scheduledStartAt: new Date('2026-03-23T14:00:00Z'),
        contentAt: new Date('2026-03-23T14:00:00Z'),
        title: 'Postponed Stream',
        thumbnailUrl: null,
      })
    })

    it('upcoming without scheduledStartTime keeps existing scheduledStartAt', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Postponed Stream',
        liveBroadcastContent: 'upcoming',
        publishedAt: null,
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingUpcomingUpdate(detail, existing)

      expect(result).toEqual({
        scheduledStartAt: new Date('2026-03-22T10:00:00Z'),
        contentAt: new Date('2026-03-22T10:00:00Z'),
        title: 'Postponed Stream',
        thumbnailUrl: null,
      })
    })

    it('none → CANCELLED', () => {
      const detail: VideoDetail = {
        platformContentId: 'vid-2',
        title: 'Cancelled Stream',
        liveBroadcastContent: 'none',
        publishedAt: '2026-03-22T09:00:00Z',
        scheduledStartTime: null,
        actualStartTime: null,
        actualEndTime: null,
        durationSeconds: null,
        thumbnailUrl: null,
      }

      const result = determineExistingUpcomingUpdate(detail, existing)

      expect(result).toEqual({
        status: ContentStatus.CANCELLED,
        title: 'Cancelled Stream',
        thumbnailUrl: null,
      })
    })
  })

  describe('stripStatusFields', () => {
    it('status / contentAt / 配信時刻系を除去し、title / thumbnailUrl は残す', () => {
      const result = stripStatusFields({
        status: ContentStatus.ARCHIVED,
        contentAt: new Date('2026-03-22T12:00:00Z'),
        actualStartAt: new Date('2026-03-22T10:00:00Z'),
        actualEndAt: new Date('2026-03-22T12:00:00Z'),
        scheduledStartAt: new Date('2026-03-22T10:00:00Z'),
        title: 'New Title',
        thumbnailUrl: 'https://i.ytimg.com/vi/x/mqdefault.jpg',
      })

      expect(result).toEqual({
        title: 'New Title',
        thumbnailUrl: 'https://i.ytimg.com/vi/x/mqdefault.jpg',
      })
    })

    it('対象フィールドが含まれていない場合はそのまま返す', () => {
      const result = stripStatusFields({
        title: 'Same Title',
      })

      expect(result).toEqual({ title: 'Same Title' })
    })

    it('対象フィールドのみの場合は空オブジェクトになる', () => {
      const result = stripStatusFields({
        status: ContentStatus.LIVE,
        contentAt: new Date('2026-03-22T10:00:00Z'),
      })

      expect(result).toEqual({})
    })
  })
})
