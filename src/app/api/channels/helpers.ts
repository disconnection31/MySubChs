import type { Channel } from '@prisma/client'

/**
 * Channel を openapi.yaml 準拠のレスポンス形式に変換する。
 * 内部フィールド (userId, uploadsPlaylistId) を除外し、公開フィールドのみを返す。
 */
export function formatChannel(channel: Channel) {
  return {
    id: channel.id,
    platform: channel.platform,
    platformChannelId: channel.platformChannelId,
    name: channel.name,
    iconUrl: channel.iconUrl,
    categoryId: channel.categoryId,
    isActive: channel.isActive,
    lastPolledAt: channel.lastPolledAt,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  }
}
