'use client'

import { useCategorySettings } from '@/hooks/useCategorySettings'
import type { NotificationSettingResponse } from '@/types/api'

import { NotificationSettings } from './NotificationSettings'
import { PollingSettings } from './PollingSettings'
import { WatchLaterSettings } from './WatchLaterSettings'

type CategorySettingsProps = {
  categoryId: string
  settings: NotificationSettingResponse
  globalPollingInterval: number
}

export function CategorySettings({
  categoryId,
  settings,
  globalPollingInterval,
}: CategorySettingsProps) {
  const mutation = useCategorySettings()
  const disabled = mutation.isPending

  const handleSettingChange = (
    field: string,
    value: boolean | number | null,
    affectsQuota: boolean,
  ) => {
    mutation.mutate({ categoryId, field, value, affectsQuota })
  }

  // Use categoryId as prefix for unique HTML IDs when multiple categories are expanded
  const idPrefix = `cat-${categoryId}`

  return (
    <div className="space-y-6 rounded-b-lg border border-t-0 bg-muted/30 p-4">
      <PollingSettings
        idPrefix={idPrefix}
        settings={settings}
        globalPollingInterval={globalPollingInterval}
        disabled={disabled}
        onSettingChange={handleSettingChange}
      />

      <hr className="border-border" />

      <NotificationSettings
        idPrefix={idPrefix}
        settings={settings}
        disabled={disabled}
        onSettingChange={handleSettingChange}
      />

      <hr className="border-border" />

      <WatchLaterSettings
        idPrefix={idPrefix}
        settings={settings}
        disabled={disabled}
        onSettingChange={handleSettingChange}
      />
    </div>
  )
}
