import {
  YOUTUBE_CHANNELS_MAX_RESULTS,
  YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS,
  YOUTUBE_SUBSCRIPTIONS_MAX_RESULTS,
  YOUTUBE_VIDEOS_MAX_RESULTS,
} from '@/lib/config'

import type {
  ChannelMeta,
  PlaylistItem,
  PlatformAdapter,
  SubscribedChannel,
  VideoDetail,
} from './base'

// ---- Error classes ----

export class YouTubeQuotaExceededError extends Error {
  constructor() {
    super('YouTube API quota exceeded')
    this.name = 'YouTubeQuotaExceededError'
  }
}

export class YouTubeAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YouTubeAuthError'
  }
}

// ---- YouTube API response types ----

type YouTubeErrorResponse = {
  error: {
    code: number
    message: string
    errors: Array<{
      domain: string
      reason: string
      message: string
    }>
  }
}

type YouTubeSubscriptionItem = {
  snippet: {
    resourceId: {
      channelId: string
    }
    title: string
    thumbnails?: {
      default?: { url: string }
    }
  }
}

type YouTubeSubscriptionsResponse = {
  items?: YouTubeSubscriptionItem[]
  nextPageToken?: string
}

type YouTubeChannelItem = {
  id: string
  snippet: {
    title: string
    thumbnails?: {
      default?: { url: string }
    }
  }
  contentDetails: {
    relatedPlaylists: {
      uploads: string
    }
  }
}

type YouTubeChannelsResponse = {
  items?: YouTubeChannelItem[]
}

type YouTubePlaylistItemEntry = {
  snippet: {
    resourceId: {
      videoId: string
    }
    title: string
    publishedAt?: string
  }
}

type YouTubePlaylistItemsResponse = {
  items?: YouTubePlaylistItemEntry[]
}

type YouTubeVideoItem = {
  id: string
  snippet: {
    title: string
    publishedAt?: string
    liveBroadcastContent: 'none' | 'live' | 'upcoming'
  }
  liveStreamingDetails?: {
    scheduledStartTime?: string
    actualStartTime?: string
    actualEndTime?: string
  }
  contentDetails?: {
    duration?: string // ISO 8601 duration (e.g. "PT1M30S")
  }
}

type YouTubeVideosResponse = {
  items?: YouTubeVideoItem[]
}

// ---- ISO 8601 duration parser ----

/**
 * YouTube API の ISO 8601 duration 文字列を秒数に変換する。
 * 例: "PT1H2M3S" → 3723, "PT30S" → 30, "P0D" → 0
 * 不正な形式の場合は null を返す（SHORT誤判定を防止）。
 */
export function parseISO8601Duration(iso: string): number | null {
  const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return null
  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2] || '0', 10)
  const minutes = parseInt(match[3] || '0', 10)
  const seconds = parseInt(match[4] || '0', 10)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

// ---- YouTubeAdapter implementation ----

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export class YouTubeAdapter implements PlatformAdapter {
  /**
   * YouTube API への共通フェッチユーティリティ。
   * エラーハンドリング（401 / quotaExceeded 403 / その他）を一元管理する。
   */
  private async fetchYouTubeAPI<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      return response.json() as Promise<T>
    }

    if (response.status === 401) {
      throw new YouTubeAuthError('YouTube API authentication failed (401)')
    }

    if (response.status === 403) {
      const body = (await response.json()) as YouTubeErrorResponse
      const isQuotaExceeded = body.error?.errors?.some((e) => e.reason === 'quotaExceeded')
      if (isQuotaExceeded) {
        throw new YouTubeQuotaExceededError()
      }
      throw new Error(`YouTube API error: 403 ${body.error?.message ?? 'Forbidden'}`)
    }

    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`)
  }

  /**
   * 認証ユーザーのサブスクリプション一覧を全ページ取得する。
   * Quota cost: 1 unit/call × ページ数
   * ref: ref/youtube-api.md §4 subscriptions.list
   */
  async getSubscribedChannels(accessToken: string): Promise<SubscribedChannel[]> {
    const results: SubscribedChannel[] = []
    let pageToken: string | undefined

    do {
      const params = new URLSearchParams({
        part: 'snippet',
        mine: 'true',
        maxResults: String(YOUTUBE_SUBSCRIPTIONS_MAX_RESULTS),
        ...(pageToken ? { pageToken } : {}),
      })

      const data = await this.fetchYouTubeAPI<YouTubeSubscriptionsResponse>(
        `${YOUTUBE_API_BASE}/subscriptions?${params}`,
        accessToken,
      )

      for (const item of data.items ?? []) {
        results.push({
          platformChannelId: item.snippet.resourceId.channelId,
          name: item.snippet.title,
          iconUrl: item.snippet.thumbnails?.default?.url ?? null,
        })
      }

      pageToken = data.nextPageToken
    } while (pageToken)

    return results
  }

  /**
   * 指定チャンネルIDのメタデータ（uploadsPlaylistId 含む）を一括取得する。
   * 50件超の場合は50件ずつ分割してバッチ処理する。
   * Quota cost: 1 unit/call
   * ref: ref/youtube-api.md §4 channels.list
   */
  async getChannelMetas(
    platformChannelIds: string[],
    accessToken: string,
  ): Promise<ChannelMeta[]> {
    if (platformChannelIds.length === 0) return []

    const batches: string[][] = []
    for (let i = 0; i < platformChannelIds.length; i += YOUTUBE_CHANNELS_MAX_RESULTS) {
      batches.push(platformChannelIds.slice(i, i + YOUTUBE_CHANNELS_MAX_RESULTS))
    }

    const batchResults = await Promise.all(
      batches.map((batch) => {
        // id 指定のバッチAPIのため maxResults は不要（返却件数は id の数で決まる）
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          id: batch.join(','),
        })
        return this.fetchYouTubeAPI<YouTubeChannelsResponse>(
          `${YOUTUBE_API_BASE}/channels?${params}`,
          accessToken,
        )
      }),
    )

    return batchResults.flatMap(
      (data) =>
        data.items?.map((item) => ({
          platformChannelId: item.id,
          name: item.snippet.title,
          iconUrl: item.snippet.thumbnails?.default?.url ?? null,
          uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
        })) ?? [],
    )
  }

  /**
   * 指定プレイリストの最新アイテムを1ページ分取得する（全ページ取得不要）。
   * Quota cost: 1 unit/call
   * ref: ref/youtube-api.md §4 playlistItems.list
   */
  async getPlaylistItems(
    uploadsPlaylistId: string,
    accessToken: string,
    maxResults: number = YOUTUBE_PLAYLIST_ITEMS_MAX_RESULTS,
  ): Promise<PlaylistItem[]> {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: String(maxResults),
    })

    const data = await this.fetchYouTubeAPI<YouTubePlaylistItemsResponse>(
      `${YOUTUBE_API_BASE}/playlistItems?${params}`,
      accessToken,
    )

    return (data.items ?? []).map((item) => ({
      platformContentId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt ?? null,
    }))
  }

  /**
   * 指定動画IDの詳細情報（ライブ配信情報含む）を一括取得する。
   * 50件超の場合は50件ずつ分割してバッチ処理し、結果をマージする。
   * Quota cost: 1 unit/call
   * ref: ref/youtube-api.md §4 videos.list
   */
  async getVideoDetails(
    platformContentIds: string[],
    accessToken: string,
  ): Promise<VideoDetail[]> {
    if (platformContentIds.length === 0) return []

    const batches: string[][] = []
    for (let i = 0; i < platformContentIds.length; i += YOUTUBE_VIDEOS_MAX_RESULTS) {
      batches.push(platformContentIds.slice(i, i + YOUTUBE_VIDEOS_MAX_RESULTS))
    }

    const batchResults = await Promise.all(
      batches.map((batch) => {
        // id 指定のバッチAPIのため maxResults は不要（返却件数は id の数で決まる）
        const params = new URLSearchParams({
          part: 'snippet,liveStreamingDetails,contentDetails',
          id: batch.join(','),
        })
        return this.fetchYouTubeAPI<YouTubeVideosResponse>(
          `${YOUTUBE_API_BASE}/videos?${params}`,
          accessToken,
        )
      }),
    )

    return batchResults.flatMap(
      (data) =>
        data.items?.map((item) => ({
          platformContentId: item.id,
          title: item.snippet.title,
          liveBroadcastContent: item.snippet.liveBroadcastContent,
          publishedAt: item.snippet.publishedAt ?? null,
          scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime ?? null,
          actualStartTime: item.liveStreamingDetails?.actualStartTime ?? null,
          actualEndTime: item.liveStreamingDetails?.actualEndTime ?? null,
          durationSeconds: item.contentDetails?.duration
            ? parseISO8601Duration(item.contentDetails.duration)
            : null,
        })) ?? [],
    )
  }
}

export const youTubeAdapter = new YouTubeAdapter()
