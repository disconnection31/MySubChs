'use client'

import { ArrowDownAZ, ArrowUpAZ, BookmarkCheck, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { PollButton } from './PollButton'

type ContentHeaderProps = {
  categoryId: string | null
  categoryName: string
  order: 'asc' | 'desc'
  watchLaterOnly: boolean
  includeCancelled: boolean
  onToggleOrder: () => void
  onToggleWatchLaterOnly: () => void
  onToggleIncludeCancelled: () => void
}

export function ContentHeader({
  categoryId,
  categoryName,
  order,
  watchLaterOnly,
  includeCancelled,
  onToggleOrder,
  onToggleWatchLaterOnly,
  onToggleIncludeCancelled,
}: ContentHeaderProps) {
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="hidden min-w-0 flex-1 truncate text-lg font-semibold md:block">
          {categoryName}
        </h1>
        <Button variant="outline" size="sm" onClick={onToggleOrder} className="shrink-0">
          {order === 'desc' ? (
            <>
              <ArrowDownAZ className="mr-1 h-4 w-4" />
              新しい順
            </>
          ) : (
            <>
              <ArrowUpAZ className="mr-1 h-4 w-4" />
              古い順
            </>
          )}
        </Button>
        <PollButton categoryId={categoryId} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant={watchLaterOnly ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleWatchLaterOnly}
        >
          <BookmarkCheck className="mr-1 h-4 w-4" />
          後で見るのみ
        </Button>
        <Button
          variant={includeCancelled ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleIncludeCancelled}
        >
          <EyeOff className="mr-1 h-4 w-4" />
          キャンセル済みも表示
        </Button>
      </div>
    </div>
  )
}
