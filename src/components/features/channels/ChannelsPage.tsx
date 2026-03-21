'use client'

import { useCallback } from 'react'
import { AlertCircle, Info, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { useCategories } from '@/hooks/useCategories'
import { useChannels } from '@/hooks/useChannels'

import { ChannelEmptyState } from './ChannelEmptyState'
import { ChannelFilter } from './ChannelFilter'
import { ChannelGroupList } from './ChannelGroupList'
import { ChannelSkeleton } from './ChannelSkeleton'

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

  return (
    <main className="mx-auto max-w-3xl p-4">
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
        <ChannelGroupList channels={channels} categories={categories ?? []} />
      ) : (
        <ChannelEmptyState isActive={isActive} />
      )}
    </main>
  )
}
