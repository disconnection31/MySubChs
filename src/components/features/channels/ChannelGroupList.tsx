'use client'

import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelGroup } from './ChannelGroup'

type ChannelGroupListProps = {
  channels: ChannelResponse[]
  categories: CategoryResponse[]
}

type GroupedChannels = {
  categoryId: string | null
  categoryName: string
  channels: ChannelResponse[]
}

export function ChannelGroupList({ channels, categories }: ChannelGroupListProps) {
  const sortedCategories = categories.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const channelsByCategory = new Map<string | null, ChannelResponse[]>()
  for (const channel of channels) {
    const key = channel.categoryId
    const existing = channelsByCategory.get(key) ?? []
    existing.push(channel)
    channelsByCategory.set(key, existing)
  }

  const groups: GroupedChannels[] = []

  for (const category of sortedCategories) {
    const categoryChannels = channelsByCategory.get(category.id)
    if (categoryChannels && categoryChannels.length > 0) {
      groups.push({
        categoryId: category.id,
        categoryName: category.name,
        channels: categoryChannels.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
  }

  const uncategorized = channelsByCategory.get(null)
  if (uncategorized && uncategorized.length > 0) {
    groups.push({
      categoryId: null,
      categoryName: '未分類',
      channels: uncategorized.sort((a, b) => a.name.localeCompare(b.name)),
    })
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <ChannelGroup
          key={group.categoryId ?? 'uncategorized'}
          categoryName={group.categoryName}
          channels={group.channels}
          categories={sortedCategories}
        />
      ))}
    </div>
  )
}
