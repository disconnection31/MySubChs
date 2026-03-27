'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { useContents } from '@/hooks/useContents'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { ContentEmptyState } from './ContentEmptyState'
import { ContentItem } from './ContentItem'
import { ContentSkeleton } from './ContentSkeleton'

type ContentListProps = {
  categoryId: string | null
  order: 'asc' | 'desc'
  watchLaterOnly: boolean
  includeCancelled: boolean
  hasChannelsInCategory?: boolean
}

export function ContentList({
  categoryId,
  order,
  watchLaterOnly,
  includeCancelled,
  hasChannelsInCategory,
}: ContentListProps) {
  const { data, isLoading, isError, refetch, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useContents({
      categoryId,
      order,
      watchLaterOnly,
      includeCancelled,
    })

  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasNextPageRef = useRef(hasNextPage)
  const isFetchingNextPageRef = useRef(isFetchingNextPage)
  hasNextPageRef.current = hasNextPage
  isFetchingNextPageRef.current = isFetchingNextPage

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPageRef.current && !isFetchingNextPageRef.current) {
        fetchNextPage()
      }
    },
    [fetchNextPage],
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  const allContents = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data])

  if (isLoading) {
    return <ContentSkeleton />
  }

  if (isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>コンテンツの取得に失敗しました。</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              再試行
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (allContents.length === 0) {
    return (
      <ContentEmptyState
        watchLaterOnly={watchLaterOnly}
        hasChannelsInCategory={hasChannelsInCategory}
      />
    )
  }

  return (
    <div>
      {allContents.map((content) => (
        <ContentItem key={content.id} content={content} />
      ))}

      {/* Sentinel for intersection observer */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasNextPage && allContents.length > 0 && (
        <div className="py-4 text-center text-xs text-muted-foreground">
          すべて読み込みました
        </div>
      )}
    </div>
  )
}
