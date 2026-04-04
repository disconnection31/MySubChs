'use client'

import { ChevronDown } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { CategoryResponse, ChannelResponse } from '@/types/api'

import { ChannelRow } from './ChannelRow'

type ChannelGroupProps = {
  categoryId: string | null
  categoryName: string
  channels: ChannelResponse[]
  categories: CategoryResponse[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelGroup({
  categoryId,
  categoryName,
  channels,
  categories,
  isOpen,
  onOpenChange,
}: ChannelGroupProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div
        id={`category-${categoryId ?? 'uncategorized'}`}
        className="scroll-mt-20"
      >
        <CollapsibleTrigger asChild>
          <button className="mb-2 flex w-full items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                !isOpen && '-rotate-90',
              )}
            />
            {categoryName} ({channels.length})
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            {channels.map((channel) => (
              <ChannelRow key={channel.id} channel={channel} categories={categories} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
