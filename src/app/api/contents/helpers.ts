import type { Content, Channel, WatchLater, Prisma } from '@prisma/client'

import { encodeCursor } from '@/lib/api-helpers'
import type { ContentResponse, PaginationMeta, WatchLaterResponse } from '@/types/api'

export type ContentWithRelations = Content & {
  channel: Pick<Channel, 'name' | 'iconUrl'>
  watchLaters: WatchLater[]
}

/**
 * アクティブな WatchLater を抽出する Prisma where 条件を生成する。
 * DB クエリとインメモリフィルタで条件が乖離しないよう、共通の now を受け取る。
 */
export function activeWatchLaterWhere(
  userId: string,
  now: Date,
): Prisma.WatchLaterWhereInput {
  return {
    userId,
    removedVia: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
}

function findActiveWatchLater(
  watchLaters: WatchLater[],
  userId: string,
  now: Date,
): WatchLater | undefined {
  return watchLaters.find(
    (wl) =>
      wl.userId === userId &&
      wl.removedVia === null &&
      (wl.expiresAt === null || wl.expiresAt > now),
  )
}

export function formatWatchLater(wl: WatchLater): WatchLaterResponse {
  return {
    addedVia: wl.addedVia,
    expiresAt: wl.expiresAt?.toISOString() ?? null,
    addedAt: wl.addedAt.toISOString(),
  }
}

export function formatContent(
  content: ContentWithRelations,
  userId: string,
  now: Date,
): ContentResponse {
  const activeWatchLater = findActiveWatchLater(content.watchLaters, userId, now)

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
    thumbnailUrl: content.thumbnailUrl,
    channel: {
      name: content.channel.name,
      iconUrl: content.channel.iconUrl,
    },
    watchLater: activeWatchLater ? formatWatchLater(activeWatchLater) : null,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  }
}

export function buildPaginationMeta(
  contents: ContentWithRelations[],
  limit: number,
): PaginationMeta {
  const hasNext = contents.length > limit
  if (!hasNext) {
    return { hasNext: false, nextCursor: null }
  }

  const lastItem = contents[limit - 1]
  const nextCursor = encodeCursor(lastItem.contentAt.toISOString(), lastItem.id)

  return { hasNext: true, nextCursor }
}
