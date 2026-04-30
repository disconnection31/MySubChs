'use client'

import { Bookmark, BookmarkCheck, Check, Loader2, MoreVertical } from 'lucide-react'
import Image from 'next/image'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUpdateContentStatus } from '@/hooks/useUpdateContentStatus'
import { useWatchLater } from '@/hooks/useWatchLater'
import { getContentDateText, STATUS_OPTIONS } from '@/lib/content-utils'
import type { ContentResponse } from '@/types/api'

import { StatusBadge } from './StatusBadge'

type ContentItemProps = {
  content: ContentResponse
}

export function ContentItem({ content }: ContentItemProps) {
  const watchLaterMutation = useWatchLater()
  const updateStatusMutation = useUpdateContentStatus()
  const isWatchLater = content.watchLater !== null
  const dateText = getContentDateText(content)

  const handleToggleWatchLater = () => {
    if (watchLaterMutation.isPending) return
    watchLaterMutation.mutate({
      contentId: content.id,
      isCurrentlyWatchLater: isWatchLater,
    })
  }

  const handleSelectStatus = (status: ContentResponse['status']) => {
    if (updateStatusMutation.isPending) return
    if (status === content.status) return
    updateStatusMutation.mutate({
      contentId: content.id,
      status,
    })
  }

  return (
    <div className="flex items-start gap-3 border-b px-4 py-3">
      {/* サムネイル: PC のみ表示 */}
      <div className="hidden md:block shrink-0">
        {content.thumbnailUrl ? (
          <Image
            src={content.thumbnailUrl}
            alt={content.title}
            width={120}
            height={67}
            className="rounded object-cover"
          />
        ) : (
          <div
            className="w-[120px] h-[67px] rounded bg-muted"
            aria-hidden="true"
          />
        )}
      </div>

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 md:h-9 md:w-9"
                disabled={updateStatusMutation.isPending}
                aria-label="ステータスを変更"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>ステータスを変更</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map((option) => {
                const isCurrent = option.value === content.status
                return (
                  <DropdownMenuItem
                    key={option.value}
                    disabled={isCurrent || updateStatusMutation.isPending}
                    onSelect={() => handleSelectStatus(option.value)}
                    className="gap-2"
                  >
                    {isCurrent ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <span className="w-4" aria-hidden="true" />
                    )}
                    {option.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* チャンネルアイコン: PC・SP 共通 */}
          {content.channel.iconUrl ? (
            <Image
              src={content.channel.iconUrl}
              alt={content.channel.name}
              width={20}
              height={20}
              className="shrink-0 rounded-full"
            />
          ) : (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {content.channel.name.charAt(0).toUpperCase()}
            </div>
          )}
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
