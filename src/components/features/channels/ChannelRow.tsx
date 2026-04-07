'use client'

import { useState } from 'react'
import { User } from 'lucide-react'
import Image from 'next/image'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateChannel } from '@/hooks/useChannels'
import { YOUTUBE_CHANNEL_URL_TEMPLATE } from '@/lib/config'
import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelDeactivateDialog } from './ChannelDeactivateDialog'

type ChannelRowProps = {
  channel: ChannelResponse
  categories: CategoryResponse[]
}

const UNCATEGORIZED_VALUE = '__uncategorized__'

function getChannelUrl(platform: string, platformChannelId: string): string | null {
  switch (platform) {
    case 'youtube':
      return `${YOUTUBE_CHANNEL_URL_TEMPLATE}${platformChannelId}`
    default:
      return null
  }
}

export function ChannelRow({ channel, categories }: ChannelRowProps) {
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const updateChannel = useUpdateChannel()

  const handleCategoryChange = (value: string) => {
    const categoryId = value === UNCATEGORIZED_VALUE ? null : value
    updateChannel.mutate({
      channelId: channel.id,
      data: { categoryId },
    })
  }

  const channelUrl = getChannelUrl(channel.platform, channel.platformChannelId)

  const iconAndName = (
    <>
      {channel.iconUrl ? (
        <Image
          src={channel.iconUrl}
          alt={channel.name}
          width={32}
          height={32}
          className="shrink-0 rounded-full"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <span className="truncate text-sm font-medium group-hover/link:text-blue-400 transition-colors">
        {channel.name}
      </span>
    </>
  )

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-center md:gap-3 hover:bg-blue-950/30 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {channelUrl ? (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link flex min-w-0 flex-1 items-center gap-3"
            >
              {iconAndName}
            </a>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">{iconAndName}</div>
          )}
        </div>

        {channel.isActive ? (
          <div className="flex items-center gap-2 md:shrink-0">
            <Select
              value={channel.categoryId ?? UNCATEGORIZED_VALUE}
              onValueChange={handleCategoryChange}
              disabled={updateChannel.isPending}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNCATEGORIZED_VALUE}>未分類</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeactivateDialogOpen(true)}
            >
              解除
            </Button>
          </div>
        ) : (
          <Badge variant="outline" className="w-fit">
            解除済み
          </Badge>
        )}
      </div>

      {deactivateDialogOpen && (
        <ChannelDeactivateDialog
          channelId={channel.id}
          channelName={channel.name}
          open={deactivateDialogOpen}
          onOpenChange={setDeactivateDialogOpen}
        />
      )}
    </>
  )
}
