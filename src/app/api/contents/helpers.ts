import type { Content, Channel, WatchLater } from '@prisma/client'

import { encodeCursor } from '@/lib/api-helpers'
import type { ContentResponse, WatchLaterResponse } from '@/types/api'

export type ContentWithRelations = Content & {
  channel: Pick<Channel, 'name' | 'iconUrl'>
  watchLaters: WatchLater[]
}

/**
 * WatchLater レコードから有効な（アクティブな）エントリを抽出する。
 * removedVia IS NULL かつ expiresAt が未設定 or 未来の場合にアクティブとみなす。
 */
function findActiveWatchLater(
  watchLaters: WatchLater[],
  userId: string,
): WatchLater | undefined {
  const now = new Date()
  return watchLaters.find(
    (wl) =>
      wl.userId === userId &&
      wl.removedVia === null &&
      (wl.expiresAt === null || wl.expiresAt > now),
  )
}

/**
 * WatchLater を API レスポンス形式に変換する。
 */
function formatWatchLater(wl: WatchLater): WatchLaterResponse {
  return {
    addedVia: wl.addedVia,
    expiresAt: wl.expiresAt?.toISOString() ?? null,
    addedAt: wl.addedAt.toISOString(),
  }
}

/**
 * Content + リレーションを OpenAPI 仕様準拠のレスポンス形式に変換する。
 */
export function formatContent(
  content: ContentWithRelations,
  userId: string,
): ContentResponse {
  const activeWatchLater = findActiveWatchLater(content.watchLaters, userId)

  return {
    id: content.id,
    channelId: content.channelId,
    platform: content.platform,
    platformContentId: content.platformContentId,
    title: content.title,
    type: content.type,
    status: content.status,
    contentAt: content.contentAt.toISOString(),
    publishedAt: content.publishedAt?.toISOString() ?? null,
    scheduledStartAt: content.scheduledStartAt?.toISOString() ?? null,
    actualStartAt: content.actualStartAt?.toISOString() ?? null,
    actualEndAt: content.actualEndAt?.toISOString() ?? null,
    url: content.url,
    channel: {
      name: content.channel.name,
      iconUrl: content.channel.iconUrl,
    },
    watchLater: activeWatchLater ? formatWatchLater(activeWatchLater) : null,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  }
}

/**
 * コンテンツ配列から nextCursor を生成する。
 * N+1 パターン: limit+1 件取得し、超過分があれば hasNext=true。
 */
export function buildPaginationMeta(
  contents: ContentWithRelations[],
  limit: number,
): { hasNext: boolean; nextCursor: string | null } {
  const hasNext = contents.length > limit
  if (!hasNext) {
    return { hasNext: false, nextCursor: null }
  }

  // The last item within the limit is the cursor reference
  const lastItem = contents[limit - 1]
  const nextCursor = encodeCursor(lastItem.contentAt.toISOString(), lastItem.id)

  return { hasNext: true, nextCursor }
}
