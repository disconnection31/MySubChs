import { Clock, TimerOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import { useSettings } from '@/hooks/useSettings'
import { Separator } from '@/components/ui/separator'
import type { CategoryResponse } from '@/types/api'

type PollingIconProps = {
  autoPollingEnabled: boolean
  pollingIntervalMinutes: number | null
  globalPollingIntervalMinutes: number | undefined
  isUncategorized?: boolean
}

export function getPollingTooltip({
  autoPollingEnabled,
  pollingIntervalMinutes,
  globalPollingIntervalMinutes,
  isUncategorized,
}: PollingIconProps): string {
  if (isUncategorized) {
    return '自動ポーリング: 無効（未分類チャンネルは対象外）'
  }
  if (!autoPollingEnabled) {
    return '自動ポーリング: 無効（手動のみ）'
  }
  if (pollingIntervalMinutes !== null) {
    return `自動ポーリング: ${pollingIntervalMinutes}分ごと`
  }
  if (globalPollingIntervalMinutes !== undefined) {
    return `自動ポーリング: グローバル設定（${globalPollingIntervalMinutes}分）`
  }
  return '自動ポーリング: グローバル設定'
}

function PollingStatusIcon({
  autoPollingEnabled,
  pollingIntervalMinutes,
  globalPollingIntervalMinutes,
  isUncategorized,
}: PollingIconProps) {
  const isOff = isUncategorized || !autoPollingEnabled
  const tooltip = getPollingTooltip({
    autoPollingEnabled,
    pollingIntervalMinutes,
    globalPollingIntervalMinutes,
    isUncategorized,
  })
  const Icon = isOff ? TimerOff : Clock

  return (
    <span className="ml-2 shrink-0" title={tooltip}>
      <Icon
        className={cn('h-3.5 w-3.5', isOff ? 'text-muted-foreground/50' : 'text-muted-foreground')}
      />
    </span>
  )
}

type CategoryNavProps = {
  categories: CategoryResponse[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string) => void
}

export function CategoryNav({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: CategoryNavProps) {
  const { data: settings } = useSettings()

  return (
    <nav className="flex flex-col py-2">
      {categories.map((category) => {
        const autoPollingEnabled = category.settings?.autoPollingEnabled ?? true
        const pollingIntervalMinutes = category.settings?.pollingIntervalMinutes ?? null

        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              'flex items-center px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
              selectedCategoryId === category.id && 'bg-accent font-medium',
            )}
          >
            <span className="truncate">{category.name}</span>
            <PollingStatusIcon
              autoPollingEnabled={autoPollingEnabled}
              pollingIntervalMinutes={pollingIntervalMinutes}
              globalPollingIntervalMinutes={settings?.pollingIntervalMinutes}
            />
          </button>
        )
      })}
      <Separator className="my-1" />
      <button
        onClick={() => onSelectCategory(UNCATEGORIZED_CATEGORY_ID)}
        className={cn(
          'flex items-center px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
          selectedCategoryId === UNCATEGORIZED_CATEGORY_ID && 'bg-accent font-medium',
        )}
      >
        <span className="truncate">未分類</span>
        <PollingStatusIcon
          autoPollingEnabled={false}
          pollingIntervalMinutes={null}
          globalPollingIntervalMinutes={settings?.pollingIntervalMinutes}
          isUncategorized
        />
      </button>
    </nav>
  )
}
