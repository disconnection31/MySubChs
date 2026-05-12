'use client'

import { ArrowDownAZ, ArrowUpAZ, Filter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { countActiveFilters, type ContentStatusFilter } from '@/lib/content-utils'

import { ContentFilterPanel } from './ContentFilterPanel'
import { PollButton } from './PollButton'

type ContentHeaderProps = {
  categoryId: string | null
  categoryName: string
  order: 'asc' | 'desc'
  status: ContentStatusFilter[]
  watchLaterOnly: boolean
  includeCancelled: boolean
  onToggleOrder: () => void
  onChangeStatus: (next: ContentStatusFilter[]) => void
  onToggleWatchLaterOnly: () => void
  onToggleIncludeCancelled: () => void
  onClearFilters: () => void
}

export function ContentHeader({
  categoryId,
  categoryName,
  order,
  status,
  watchLaterOnly,
  includeCancelled,
  onToggleOrder,
  onChangeStatus,
  onToggleWatchLaterOnly,
  onToggleIncludeCancelled,
  onClearFilters,
}: ContentHeaderProps) {
  const activeFilterCount = countActiveFilters({ status, watchLaterOnly, includeCancelled })

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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={activeFilterCount > 0 ? 'default' : 'outline'}
              size="sm"
              className="shrink-0"
              aria-label={
                activeFilterCount > 0
                  ? `フィルタを開く（${activeFilterCount}件適用中）`
                  : 'フィルタを開く'
              }
            >
              <Filter className="mr-1 h-4 w-4" />
              フィルタ
              {activeFilterCount > 0 && (
                <span
                  aria-hidden="true"
                  className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-xs font-medium"
                >
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ContentFilterPanel
              status={status}
              watchLaterOnly={watchLaterOnly}
              includeCancelled={includeCancelled}
              onChangeStatus={onChangeStatus}
              onToggleWatchLaterOnly={onToggleWatchLaterOnly}
              onToggleIncludeCancelled={onToggleIncludeCancelled}
              onClear={onClearFilters}
            />
          </PopoverContent>
        </Popover>
        <PollButton categoryId={categoryId} />
      </div>
    </div>
  )
}
