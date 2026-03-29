import { describe, expect, it } from 'vitest'

import type { ContentResponse } from '@/types/api'

import {
  formatLocalDateTime,
  getContentDateText,
  getStatusBadgeConfig,
} from './content-utils'

// Helper to build a minimal ContentResponse for testing
function makeContent(
  overrides: Partial<ContentResponse> & Pick<ContentResponse, 'type' | 'status'>,
): ContentResponse {
  return {
    id: 'test-id',
    channelId: 'ch-id',
    platform: 'YOUTUBE',
    platformContentId: 'yt-123',
    title: 'Test Video',
    contentAt: '2026-03-03T06:00:00Z',
    publishedAt: null,
    scheduledStartAt: null,
    actualStartAt: null,
    actualEndAt: null,
    url: 'https://www.youtube.com/watch?v=yt-123',
    channel: { name: 'Test Channel', iconUrl: null },
    watchLater: null,
    createdAt: '2026-03-03T06:00:00Z',
    updatedAt: '2026-03-03T06:00:00Z',
    ...overrides,
  }
}

describe('getStatusBadgeConfig', () => {
  it('returns destructive badge for LIVE/LIVE', () => {
    const config = getStatusBadgeConfig('LIVE', 'LIVE')
    expect(config.text).toBe('配信中')
    expect(config.variant).toBe('destructive')
  })

  it('returns blue badge for LIVE/UPCOMING', () => {
    const config = getStatusBadgeConfig('LIVE', 'UPCOMING')
    expect(config.text).toBe('配信予定')
    expect(config.className).toContain('bg-blue-600')
  })

  it('returns green filled badge for LIVE/ARCHIVED', () => {
    const config = getStatusBadgeConfig('LIVE', 'ARCHIVED')
    expect(config.text).toBe('アーカイブ')
    expect(config.className).toContain('bg-green-600')
  })

  it('returns green outline badge for VIDEO/ARCHIVED', () => {
    const config = getStatusBadgeConfig('VIDEO', 'ARCHIVED')
    expect(config.text).toBe('動画')
    expect(config.variant).toBe('outline')
    expect(config.className).toContain('border-green-600')
  })

  it('returns purple outline badge for SHORT/ARCHIVED', () => {
    const config = getStatusBadgeConfig('SHORT', 'ARCHIVED')
    expect(config.text).toBe('ショート')
    expect(config.variant).toBe('outline')
    expect(config.className).toContain('border-purple-600')
  })

  it('returns muted outline badge for LIVE/CANCELLED', () => {
    const config = getStatusBadgeConfig('LIVE', 'CANCELLED')
    expect(config.text).toBe('キャンセル済み')
    expect(config.variant).toBe('outline')
    expect(config.className).toContain('text-muted-foreground')
  })
})

describe('formatLocalDateTime', () => {
  it('formats ISO date string to local YYYY/MM/DD HH:mm', () => {
    // Use a fixed timezone offset to make test deterministic
    const result = formatLocalDateTime('2026-03-03T15:00:00+09:00')
    // In JST, this should be 2026/03/03 15:00
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
  })

  it('pads single-digit months and days', () => {
    const result = formatLocalDateTime('2026-01-05T03:07:00+09:00')
    expect(result).toMatch(/\/01\/05/)
    expect(result).toMatch(/\d{2}:\d{2}$/)
  })
})

describe('getContentDateText', () => {
  it('returns publishedAt for VIDEO/ARCHIVED', () => {
    const content = makeContent({
      type: 'VIDEO',
      status: 'ARCHIVED',
      publishedAt: '2026-03-03T15:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).not.toBeNull()
    expect(result).not.toContain('配信')
  })

  it('returns null for VIDEO/ARCHIVED when publishedAt is null', () => {
    const content = makeContent({
      type: 'VIDEO',
      status: 'ARCHIVED',
      publishedAt: null,
    })
    expect(getContentDateText(content)).toBeNull()
  })

  it('returns publishedAt for SHORT/ARCHIVED', () => {
    const content = makeContent({
      type: 'SHORT',
      status: 'ARCHIVED',
      publishedAt: '2026-03-03T15:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).not.toBeNull()
    expect(result).not.toContain('配信')
  })

  it('returns null for SHORT/ARCHIVED when publishedAt is null', () => {
    const content = makeContent({
      type: 'SHORT',
      status: 'ARCHIVED',
      publishedAt: null,
    })
    expect(getContentDateText(content)).toBeNull()
  })

  it('returns prefixed text for LIVE/UPCOMING', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'UPCOMING',
      scheduledStartAt: '2026-03-03T20:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).toContain('配信予定:')
  })

  it('returns prefixed text for LIVE/LIVE', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'LIVE',
      actualStartAt: '2026-03-03T19:58:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).toContain('配信開始:')
  })

  it('returns actualStartAt for LIVE/ARCHIVED', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'ARCHIVED',
      actualStartAt: '2026-03-03T19:58:00+09:00',
      scheduledStartAt: '2026-03-03T20:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).not.toBeNull()
    expect(result).not.toContain('配信')
    expect(result).not.toContain('予定')
  })

  it('falls back to scheduledStartAt for LIVE/ARCHIVED when actualStartAt is null', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'ARCHIVED',
      actualStartAt: null,
      scheduledStartAt: '2026-03-03T20:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).not.toBeNull()
  })

  it('returns prefixed text for LIVE/CANCELLED', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'CANCELLED',
      scheduledStartAt: '2026-03-03T20:00:00+09:00',
    })
    const result = getContentDateText(content)
    expect(result).toContain('予定:')
  })

  it('returns null for LIVE/CANCELLED when scheduledStartAt is null', () => {
    const content = makeContent({
      type: 'LIVE',
      status: 'CANCELLED',
      scheduledStartAt: null,
    })
    expect(getContentDateText(content)).toBeNull()
  })
})
