'use client'

import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelGroup } from './ChannelGroup'

export type GroupedChannels = {
  categoryId: string | null
  categoryName: string
  channels: ChannelResponse[]
}

type ChannelGroupListProps = {
  groups: GroupedChannels[]
  categories: CategoryResponse[]
  collapsedState: Map<string, boolean>
  onToggleCollapse: (key: string, open: boolean) => void
}

export function ChannelGroupList({
  groups,
  categories,
  collapsedState,
  onToggleCollapse,
}: ChannelGroupListProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const key = group.categoryId ?? 'uncategorized'
        const isOpen = collapsedState.get(key) !== false
        return (
          <ChannelGroup
            key={key}
            categoryId={group.categoryId}
            categoryName={group.categoryName}
            channels={group.channels}
            categories={categories}
            isOpen={isOpen}
            onOpenChange={(open) => onToggleCollapse(key, open)}
          />
        )
      })}
    </div>
  )
}
