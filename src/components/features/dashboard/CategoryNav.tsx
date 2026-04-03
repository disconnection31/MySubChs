'use client'

import { Clock, TimerOff } from 'lucide-react'

import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import { Separator } from '@/components/ui/separator'
import type { CategoryResponse, NotificationSettingResponse } from '@/types/api'

type CategoryNavProps = {
  categories: CategoryResponse[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string) => void
}

type PollingIconProps = {
  settings: NotificationSettingResponse | null
  globalIntervalMinutes: number | undefined
  isUncategorized?: boolean
}

function PollingIcon({ settings, globalIntervalMinutes, isUncategorized }: PollingIconProps) {
  if (isUncategorized) {
    return (
      <span title="自動ポーリング: 無効（未分類チャンネルは対象外）" className="shrink-0">
        <TimerOff className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    )
  }

  if (settings === null) {
    return null
  }

  if (!settings.autoPollingEnabled) {
    return (
      <span title="自動ポーリング: 無効（手動のみ）" className="shrink-0">
        <TimerOff className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    )
  }

  if (settings.pollingIntervalMinutes !== null) {
    return (
      <span title={`自動ポーリング: ${settings.pollingIntervalMinutes}分ごと`} className="shrink-0">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    )
  }

  const globalInterval = globalIntervalMinutes !== undefined ? `${globalIntervalMinutes}分` : '-'
  return (
    <span title={`自動ポーリング: グローバル設定（${globalInterval}）`} className="shrink-0">
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  )
}

export function CategoryNav({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: CategoryNavProps) {
  const { data: settings } = useSettings()

  return (
    <nav className="flex flex-col py-2">
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelectCategory(category.id)}
          className={cn(
            'flex items-center gap-1 px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
            selectedCategoryId === category.id && 'bg-accent font-medium',
          )}
        >
          <span className="flex-1 truncate">{category.name}</span>
          <PollingIcon
            settings={category.settings}
            globalIntervalMinutes={settings?.pollingIntervalMinutes}
          />
        </button>
      ))}
      <Separator className="my-1" />
      <button
        onClick={() => onSelectCategory(UNCATEGORIZED_CATEGORY_ID)}
        className={cn(
          'flex items-center gap-1 px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
          selectedCategoryId === UNCATEGORIZED_CATEGORY_ID && 'bg-accent font-medium',
        )}
      >
        <span className="flex-1 truncate">未分類</span>
        <PollingIcon settings={null} globalIntervalMinutes={undefined} isUncategorized />
      </button>
    </nav>
  )
}
