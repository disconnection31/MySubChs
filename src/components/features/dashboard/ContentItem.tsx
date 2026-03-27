'use client'

import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getContentDateText } from '@/lib/content-utils'
import { useWatchLater } from '@/hooks/useWatchLater'
import type { ContentResponse } from '@/types/api'

import { StatusBadge } from './StatusBadge'

type ContentItemProps = {
  content: ContentResponse
}

export function ContentItem({ content }: ContentItemProps) {
  const watchLaterMutation = useWatchLater()
  const isWatchLater = content.watchLater !== null
  const dateText = getContentDateText(content)

  const handleToggleWatchLater = () => {
    if (watchLaterMutation.isPending) return
    watchLaterMutation.mutate({
      contentId: content.id,
      isCurrentlyWatchLater: isWatchLater,
    })
  }

  return (
    <div className="flex items-start gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <StatusBadge type={content.type} status={content.status} />
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline line-clamp-2"
          >
            {content.title}
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 md:h-9 md:w-9"
            onClick={handleToggleWatchLater}
            disabled={watchLaterMutation.isPending}
            aria-label={isWatchLater ? '後で見るから削除' : '後で見るに追加'}
          >
            {watchLaterMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isWatchLater ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{content.channel.name}</span>
          {dateText && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="shrink-0">{dateText}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
