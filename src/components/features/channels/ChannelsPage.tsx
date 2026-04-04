'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Info, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { useCategories } from '@/hooks/useCategories'
import { useChannels } from '@/hooks/useChannels'
import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { CategoryNavMobile, CategoryNavSidebar } from './CategoryNav'
import { ChannelEmptyState } from './ChannelEmptyState'
import { ChannelFilter } from './ChannelFilter'
import { type GroupedChannels, ChannelGroupList } from './ChannelGroupList'
import { ChannelSkeleton } from './ChannelSkeleton'

function buildGroups(
  channels: ChannelResponse[],
  categories: CategoryResponse[],
): GroupedChannels[] {
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

  return groups
}

export function ChannelsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const filterParam = searchParams.get('filter')
  const isActive = filterParam !== 'inactive'

  const setIsActive = useCallback(
    (active: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (active) {
        params.set('filter', 'active')
      } else {
        params.set('filter', 'inactive')
      }
      router.replace(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname],
  )

  const {
    data: channels,
    isLoading: isChannelsLoading,
    isError: isChannelsError,
    refetch: refetchChannels,
  } = useChannels(isActive)
  const { data: categories, isLoading: isCategoriesLoading } = useCategories()

  const isLoading = isChannelsLoading || isCategoriesLoading
  const hasChannels = channels && channels.length > 0

  const sortedCategories = useMemo(
    () => (categories ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  const groups = useMemo(
    () => (hasChannels ? buildGroups(channels, categories ?? []) : []),
    [channels, categories, hasChannels],
  )

  const [collapsedState, setCollapsedState] = useState<Map<string, boolean>>(new Map())

  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsedState((prev) => {
      const next = new Map(prev)
      const current = next.get(key) !== false
      next.set(key, !current)
      return next
    })
  }, [])

  const handleSelectCategory = useCallback(
    (categoryId: string | null) => {
      const key = categoryId ?? 'uncategorized'

      // Auto-expand if collapsed
      setCollapsedState((prev) => {
        if (prev.get(key) === false) {
          const next = new Map(prev)
          next.set(key, true)
          return next
        }
        return prev
      })

      // Scroll to the category group after a short delay to allow expand animation
      setTimeout(() => {
        const el = document.getElementById(`category-${key}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
        }
      }, 50)
    },
    [],
  )

  const showNav = groups.length > 1

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-2xl font-bold">チャンネル管理</h1>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          YouTubeでチャンネルの登録・解除を行った場合は、設定画面からチャンネルを再同期してください。
          <Link href="/settings" className="ml-1 font-medium underline hover:no-underline">
            設定画面へ
          </Link>
        </p>
      </div>

      <div className="mb-4">
        <ChannelFilter isActive={isActive} onChange={setIsActive} />
      </div>

      {isLoading ? (
        <ChannelSkeleton />
      ) : isChannelsError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">
            チャンネルの取得に失敗しました。再読み込みしてください。
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchChannels()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            再読み込み
          </Button>
        </div>
      ) : hasChannels ? (
        <div className="flex gap-6">
          {showNav && (
            <CategoryNavSidebar
              groups={groups}
              onSelectCategory={handleSelectCategory}
            />
          )}
          <div className="min-w-0 flex-1">
            <ChannelGroupList
              groups={groups}
              categories={sortedCategories}
              collapsedState={collapsedState}
              onToggleCollapse={handleToggleCollapse}
            />
          </div>
          {showNav && (
            <CategoryNavMobile
              groups={groups}
              onSelectCategory={handleSelectCategory}
            />
          )}
        </div>
      ) : (
        <ChannelEmptyState isActive={isActive} />
      )}
    </main>
  )
}
