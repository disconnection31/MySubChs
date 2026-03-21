import type { Channel } from '@prisma/client'

import type { ChannelResponse } from '@/types/api'

export function formatChannel(channel: Channel): ChannelResponse {
  return {
    id: channel.id,
    platform: channel.platform,
    platformChannelId: channel.platformChannelId,
    name: channel.name,
    iconUrl: channel.iconUrl,
    categoryId: channel.categoryId,
    isActive: channel.isActive,
    lastPolledAt: channel.lastPolledAt?.toISOString() ?? null,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  }
}
