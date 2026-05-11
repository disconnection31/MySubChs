import type { Content, Channel, WatchLater } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildPaginationMeta, formatContent, type ContentWithRelations } from './helpers'

// --- Test factories ---

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: 'content-1',
    channelId: 'channel-1',
    platform: 'youtube',
    platformContentId: 'vid123',
    title: 'Test Video',
    type: 'VIDEO',
    status: 'ARCHIVED',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    scheduledStartAt: null,
    actualStartAt: null,
    actualEndAt: null,
    contentAt: new Date('2026-01-01T00:00:00.000Z'),
    statusManuallySetAt: null,
    url: 'https://www.youtube.com/watch?v=vid123',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid123/mqdefault.jpg',
    durationSeconds: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeChannel(overrides: Partial<Pick<Channel, 'name' | 'iconUrl'>> = {}): Pick<Channel, 'name' | 'iconUrl'> {
  return {
    name: 'Test Channel',
    iconUrl: 'https://example.com/icon.jpg',
    ...overrides,
  }
}

function makeWatchLater(overrides: Partial<WatchLater> = {}): WatchLater {
  return {
    userId: 'user-1',
    contentId: 'content-1',
    addedVia: 'MANUAL',
    removedVia: null,
    expiresAt: null,
    addedAt: new Date('2026-01-01T12:00:00.000Z'),
    ...overrides,
  }
}

function makeContentWithRelations(
  overrides: Partial<Content> = {},
  channel?: Partial<Pick<Channel, 'name' | 'iconUrl'>>,
  watchLaters: WatchLater[] = [],
): ContentWithRelations {
  return {
    ...makeContent(overrides),
    channel: makeChannel(channel),
    watchLaters,
  }
}

// --- Tests ---

describe('formatContent', () => {
  it('Content を API レスポンス形式に変換する', () => {
    const content = makeContentWithRelations()
    const result = formatContent(content, 'user-1', new Date())

    expect(result).toEqual({
      id: 'content-1',
      channelId: 'channel-1',
      platform: 'youtube',
      platformContentId: 'vid123',
      title: 'Test Video',
      type: 'VIDEO',
      status: 'ARCHIVED',
      contentAt: '2026-01-01T00:00:00.000Z',
      publishedAt: '2026-01-01T00:00:00.000Z',
      scheduledStartAt: null,
      actualStartAt: null,
      actualEndAt: null,
      statusManuallySetAt: null,
      url: 'https://www.youtube.com/watch?v=vid123',
      thumbnailUrl: 'https://i.ytimg.com/vi/vid123/mqdefault.jpg',
      channel: {
        name: 'Test Channel',
        iconUrl: 'https://example.com/icon.jpg',
      },
      watchLater: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('アクティブな WatchLater がある場合に watchLater を返す', () => {
    const wl = makeWatchLater()
    const content = makeContentWithRelations({}, undefined, [wl])
    const result = formatContent(content, 'user-1', new Date())

    expect(result.watchLater).toEqual({
      addedVia: 'MANUAL',
      expiresAt: null,
      addedAt: '2026-01-01T12:00:00.000Z',
    })
  })

  it('removedVia が設定済みの WatchLater は無視する', () => {
    const wl = makeWatchLater({ removedVia: 'MANUAL' })
    const content = makeContentWithRelations({}, undefined, [wl])
    const result = formatContent(content, 'user-1', new Date())

    expect(result.watchLater).toBeNull()
  })

  it('expiresAt が過去の WatchLater は無視する', () => {
    const wl = makeWatchLater({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })
    const content = makeContentWithRelations({}, undefined, [wl])
    const result = formatContent(content, 'user-1', new Date())

    expect(result.watchLater).toBeNull()
  })

  it('異なる userId の WatchLater は無視する', () => {
    const wl = makeWatchLater({ userId: 'other-user' })
    const content = makeContentWithRelations({}, undefined, [wl])
    const result = formatContent(content, 'user-1', new Date())

    expect(result.watchLater).toBeNull()
  })

  it('channel.iconUrl が null の場合にも変換できる', () => {
    const content = makeContentWithRelations({}, { iconUrl: null })
    const result = formatContent(content, 'user-1', new Date())

    expect(result.channel.iconUrl).toBeNull()
  })

  it('thumbnailUrl が null の場合にも変換できる', () => {
    const content = makeContentWithRelations({ thumbnailUrl: null })
    const result = formatContent(content, 'user-1', new Date())

    expect(result.thumbnailUrl).toBeNull()
  })
})

describe('buildPaginationMeta', () => {
  it('コンテンツ数が limit 以下の場合 hasNext=false を返す', () => {
    const contents = [makeContentWithRelations()]
    const meta = buildPaginationMeta(contents, 20)

    expect(meta).toEqual({ hasNext: false, nextCursor: null })
  })

  it('コンテンツ数が limit と等しい場合 hasNext=false を返す', () => {
    const contents = Array.from({ length: 20 }, (_, i) =>
      makeContentWithRelations({ id: `content-${i}` }),
    )
    const meta = buildPaginationMeta(contents, 20)

    expect(meta).toEqual({ hasNext: false, nextCursor: null })
  })

  it('コンテンツ数が limit+1 の場合 hasNext=true と nextCursor を返す', () => {
    const contents = Array.from({ length: 21 }, (_, i) =>
      makeContentWithRelations({
        id: `content-${i}`,
        contentAt: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
      }),
    )
    const meta = buildPaginationMeta(contents, 20)

    expect(meta.hasNext).toBe(true)
    expect(meta.nextCursor).toBeTruthy()

    // Decode the cursor and verify it matches the last item within limit (index 19)
    const decoded = JSON.parse(Buffer.from(meta.nextCursor!, 'base64').toString('utf-8'))
    expect(decoded.id).toBe('content-19')
    expect(decoded.contentAt).toBe(contents[19].contentAt.toISOString())
  })

  it('空配列の場合 hasNext=false を返す', () => {
    const meta = buildPaginationMeta([], 20)

    expect(meta).toEqual({ hasNext: false, nextCursor: null })
  })
})
