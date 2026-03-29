import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseISO8601Duration, YouTubeAdapter, YouTubeAuthError, YouTubeQuotaExceededError } from './youtube'

// グローバル fetch をモック
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const ACCESS_TOKEN = 'test-access-token'

/**
 * YouTube API のモックレスポンスを構築するヘルパー
 */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('parseISO8601Duration', () => {
  it('PT1H2M3S → 3723', () => {
    expect(parseISO8601Duration('PT1H2M3S')).toBe(3723)
  })

  it('PT1M30S → 90', () => {
    expect(parseISO8601Duration('PT1M30S')).toBe(90)
  })

  it('PT60S → 60', () => {
    expect(parseISO8601Duration('PT60S')).toBe(60)
  })

  it('PT30S → 30', () => {
    expect(parseISO8601Duration('PT30S')).toBe(30)
  })

  it('PT1H → 3600', () => {
    expect(parseISO8601Duration('PT1H')).toBe(3600)
  })

  it('PT0S → 0', () => {
    expect(parseISO8601Duration('PT0S')).toBe(0)
  })

  it('P1DT0S → 86400', () => {
    expect(parseISO8601Duration('P1DT0S')).toBe(86400)
  })

  it('P0D → 0 (no time component)', () => {
    expect(parseISO8601Duration('P0D')).toBe(0)
  })
})

describe('YouTubeAdapter', () => {
  let adapter: YouTubeAdapter

  beforeEach(() => {
    adapter = new YouTubeAdapter()
    mockFetch.mockReset()
  })

  // ---------------------------------------------------------------------------
  // getSubscribedChannels
  // ---------------------------------------------------------------------------

  describe('getSubscribedChannels', () => {
    it('nextPageToken がない場合は1ページ分のチャンネルを返す', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { channelId: 'ch1' },
                title: 'Channel 1',
                thumbnails: { default: { url: 'https://example.com/thumb1.jpg' } },
              },
            },
          ],
          // nextPageToken なし
        }),
      )

      const result = await adapter.getSubscribedChannels(ACCESS_TOKEN)

      expect(result).toEqual([
        { platformChannelId: 'ch1', name: 'Channel 1', iconUrl: 'https://example.com/thumb1.jpg' },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('nextPageToken がある場合は複数ページを全て取得する', async () => {
      // 1ページ目: nextPageToken あり
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { channelId: 'ch1' },
                title: 'Channel 1',
                thumbnails: {},
              },
            },
          ],
          nextPageToken: 'page2token',
        }),
      )
      // 2ページ目: nextPageToken なし
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { channelId: 'ch2' },
                title: 'Channel 2',
                thumbnails: {},
              },
            },
          ],
        }),
      )

      const result = await adapter.getSubscribedChannels(ACCESS_TOKEN)

      expect(result).toHaveLength(2)
      expect(result[0].platformChannelId).toBe('ch1')
      expect(result[1].platformChannelId).toBe('ch2')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // 2回目のリクエストに pageToken が含まれているか確認
      const secondCallUrl = mockFetch.mock.calls[1][0] as string
      expect(secondCallUrl).toContain('pageToken=page2token')
    })

    it('thumbnails が未定義の場合 iconUrl は null になる', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { channelId: 'ch1' },
                title: 'Channel 1',
                // thumbnails なし
              },
            },
          ],
        }),
      )

      const result = await adapter.getSubscribedChannels(ACCESS_TOKEN)

      expect(result[0].iconUrl).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // getChannelMetas
  // ---------------------------------------------------------------------------

  describe('getChannelMetas', () => {
    it('空配列を渡した場合は即座に空配列を返す', async () => {
      const result = await adapter.getChannelMetas([], ACCESS_TOKEN)
      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('50件以下の場合は1回だけ API を呼ぶ', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: 'ch1',
              snippet: { title: 'Channel 1', thumbnails: { default: { url: 'http://img.jpg' } } },
              contentDetails: { relatedPlaylists: { uploads: 'UU_ch1' } },
            },
          ],
        }),
      )

      const result = await adapter.getChannelMetas(['ch1'], ACCESS_TOKEN)

      expect(result).toEqual([
        {
          platformChannelId: 'ch1',
          name: 'Channel 1',
          iconUrl: 'http://img.jpg',
          uploadsPlaylistId: 'UU_ch1',
        },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('51件の場合は2回 API を呼ぶ（バッチ分割）', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `ch${i}`)

      // 1回目: 50件
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: ids.slice(0, 50).map((id) => ({
            id,
            snippet: { title: id, thumbnails: {} },
            contentDetails: { relatedPlaylists: { uploads: `UU_${id}` } },
          })),
        }),
      )
      // 2回目: 1件
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: 'ch50',
              snippet: { title: 'ch50', thumbnails: {} },
              contentDetails: { relatedPlaylists: { uploads: 'UU_ch50' } },
            },
          ],
        }),
      )

      const result = await adapter.getChannelMetas(ids, ACCESS_TOKEN)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(51)
    })
  })

  // ---------------------------------------------------------------------------
  // getPlaylistItems
  // ---------------------------------------------------------------------------

  describe('getPlaylistItems', () => {
    it('プレイリストの1ページ分のアイテムを返す', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { videoId: 'vid1' },
                title: 'Video 1',
                publishedAt: '2024-01-01T00:00:00Z',
              },
            },
          ],
        }),
      )

      const result = await adapter.getPlaylistItems('UU_ch1', ACCESS_TOKEN)

      expect(result).toEqual([
        { platformContentId: 'vid1', title: 'Video 1', publishedAt: '2024-01-01T00:00:00Z' },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // 1ページのみ取得（nextPageToken があっても追加取得しない）
      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('playlistId=UU_ch1')
    })

    it('publishedAt が未定義の場合は null を返す', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              snippet: {
                resourceId: { videoId: 'vid1' },
                title: 'Video 1',
                // publishedAt なし
              },
            },
          ],
        }),
      )

      const result = await adapter.getPlaylistItems('UU_ch1', ACCESS_TOKEN)

      expect(result[0].publishedAt).toBeNull()
    })

    it('カスタム maxResults が URL に反映される', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ items: [] }))

      await adapter.getPlaylistItems('UU_ch1', ACCESS_TOKEN, 10)

      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('maxResults=10')
    })
  })

  // ---------------------------------------------------------------------------
  // getVideoDetails
  // ---------------------------------------------------------------------------

  describe('getVideoDetails', () => {
    it('空配列を渡した場合は即座に空配列を返す', async () => {
      const result = await adapter.getVideoDetails([], ACCESS_TOKEN)
      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('50件以下の場合は1回だけ API を呼ぶ', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: 'vid1',
              snippet: {
                title: 'Video 1',
                publishedAt: '2024-01-01T00:00:00Z',
                liveBroadcastContent: 'none',
              },
              liveStreamingDetails: {
                scheduledStartTime: '2024-01-01T10:00:00Z',
                actualStartTime: '2024-01-01T10:05:00Z',
                actualEndTime: '2024-01-01T11:00:00Z',
              },
              contentDetails: {
                duration: 'PT10M30S',
              },
            },
          ],
        }),
      )

      const result = await adapter.getVideoDetails(['vid1'], ACCESS_TOKEN)

      expect(result).toEqual([
        {
          platformContentId: 'vid1',
          title: 'Video 1',
          liveBroadcastContent: 'none',
          publishedAt: '2024-01-01T00:00:00Z',
          scheduledStartTime: '2024-01-01T10:00:00Z',
          actualStartTime: '2024-01-01T10:05:00Z',
          actualEndTime: '2024-01-01T11:00:00Z',
          durationSeconds: 630,
        },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // contentDetails パートがリクエストされていることを確認
      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('contentDetails')
    })

    it('51件の場合は2回 API を呼ぶ（バッチ分割）', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `vid${i}`)

      // 1回目: 50件
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: ids.slice(0, 50).map((id) => ({
            id,
            snippet: { title: id, publishedAt: null, liveBroadcastContent: 'none' },
          })),
        }),
      )
      // 2回目: 1件
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: 'vid50',
              snippet: { title: 'vid50', publishedAt: null, liveBroadcastContent: 'none' },
            },
          ],
        }),
      )

      const result = await adapter.getVideoDetails(ids, ACCESS_TOKEN)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(51)
    })

    it('liveStreamingDetails がない場合は null フィールドになる', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          items: [
            {
              id: 'vid1',
              snippet: {
                title: 'Video 1',
                publishedAt: '2024-01-01T00:00:00Z',
                liveBroadcastContent: 'none',
              },
              // liveStreamingDetails なし
            },
          ],
        }),
      )

      const result = await adapter.getVideoDetails(['vid1'], ACCESS_TOKEN)

      expect(result[0].scheduledStartTime).toBeNull()
      expect(result[0].actualStartTime).toBeNull()
      expect(result[0].actualEndTime).toBeNull()
      expect(result[0].durationSeconds).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // エラーハンドリング
  // ---------------------------------------------------------------------------

  describe('エラーハンドリング', () => {
    it('HTTP 401 の場合は YouTubeAuthError を throw する', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 401, message: 'Unauthorized', errors: [] } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await expect(adapter.getSubscribedChannels(ACCESS_TOKEN)).rejects.toThrow(YouTubeAuthError)
    })

    it('HTTP 403 + quotaExceeded の場合は YouTubeQuotaExceededError を throw する', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: {
              code: 403,
              message: 'The request cannot be completed because you have exceeded your quota.',
              errors: [
                {
                  domain: 'youtube.quota',
                  reason: 'quotaExceeded',
                  message: 'quota exceeded',
                },
              ],
            },
          },
          403,
        ),
      )

      await expect(adapter.getSubscribedChannels(ACCESS_TOKEN)).rejects.toThrow(
        YouTubeQuotaExceededError,
      )
    })

    it('HTTP 403 + quotaExceeded でない場合は汎用エラーを throw する', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: {
              code: 403,
              message: 'Forbidden',
              errors: [{ domain: 'youtube', reason: 'forbidden', message: 'Forbidden' }],
            },
          },
          403,
        ),
      )

      await expect(adapter.getSubscribedChannels(ACCESS_TOKEN)).rejects.toThrow(
        'YouTube API error: 403 Forbidden',
      )
    })

    it('HTTP 500 の場合は汎用エラーを throw する', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )

      await expect(adapter.getSubscribedChannels(ACCESS_TOKEN)).rejects.toThrow(
        'YouTube API error: 500',
      )
    })
  })
})
