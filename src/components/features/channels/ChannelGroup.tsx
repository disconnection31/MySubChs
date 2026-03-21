'use client'

import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelRow } from './ChannelRow'

type ChannelGroupProps = {
  categoryName: string
  channels: ChannelResponse[]
  categories: CategoryResponse[]
  isActive: boolean
}

export function ChannelGroup({
  categoryName,
  channels,
  categories,
  isActive,
}: ChannelGroupProps) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        {categoryName} ({channels.length})
      </h2>
      <div className="space-y-2">
        {channels.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            categories={categories}
            isActive={isActive}
          />
        ))}
      </div>
    </div>
  )
}
