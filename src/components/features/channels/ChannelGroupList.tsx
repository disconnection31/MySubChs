'use client'

import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelGroup } from './ChannelGroup'

type ChannelGroupListProps = {
  channels: ChannelResponse[]
  categories: CategoryResponse[]
  isActive: boolean
}

type GroupedChannels = {
  categoryId: string | null
  categoryName: string
  sortOrder: number
  channels: ChannelResponse[]
}

export function ChannelGroupList({ channels, categories, isActive }: ChannelGroupListProps) {
  // Group channels by categoryId
  const channelsByCategory = new Map<string | null, ChannelResponse[]>()
  for (const channel of channels) {
    const key = channel.categoryId
    const existing = channelsByCategory.get(key) ?? []
    existing.push(channel)
    channelsByCategory.set(key, existing)
  }

  // Build groups with category info
  const groups: GroupedChannels[] = []

  // Add categorized groups in sortOrder
  for (const category of categories) {
    const categoryChannels = channelsByCategory.get(category.id)
    if (categoryChannels && categoryChannels.length > 0) {
      groups.push({
        categoryId: category.id,
        categoryName: category.name,
        sortOrder: category.sortOrder,
        channels: categoryChannels.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
  }

  // Sort by sortOrder
  groups.sort((a, b) => a.sortOrder - b.sortOrder)

  // Add uncategorized group at the end
  const uncategorized = channelsByCategory.get(null)
  if (uncategorized && uncategorized.length > 0) {
    groups.push({
      categoryId: null,
      categoryName: '未分類',
      sortOrder: Infinity,
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
          categories={categories}
          isActive={isActive}
        />
      ))}
    </div>
  )
}
