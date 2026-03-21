'use client'

import { useCategorySettings, type SettingField } from '@/hooks/useCategorySettings'
import type { NotificationSettingResponse } from '@/types/api'

import { NotificationSettings } from './NotificationSettings'
import { PollingSettings } from './PollingSettings'
import { WatchLaterSettings } from './WatchLaterSettings'

export type SettingChangeHandler = (field: SettingField, value: boolean | number | null) => void

const QUOTA_AFFECTING_FIELDS = new Set<SettingField>([
  'autoPollingEnabled',
  'pollingIntervalMinutes',
])

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

  const handleSettingChange = (field: SettingField, value: boolean | number | null) => {
    if (settings[field] === value) return
    mutation.mutate({
      categoryId,
      field,
      value,
      affectsQuota: QUOTA_AFFECTING_FIELDS.has(field),
    })
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
