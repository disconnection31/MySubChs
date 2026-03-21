'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { NotificationSettingResponse } from '@/types/api'

import type { SettingChangeHandler } from './CategorySettings'

type NotificationSettingsProps = {
  idPrefix: string
  settings: NotificationSettingResponse
  disabled: boolean
  onSettingChange: SettingChangeHandler
}

const NOTIFICATION_TOGGLES = [
  { field: 'notifyOnNewVideo', label: '新着動画通知', idSuffix: 'notify-new-video' },
  { field: 'notifyOnLiveStart', label: 'ライブ開始通知', idSuffix: 'notify-live-start' },
  { field: 'notifyOnUpcoming', label: '配信予定の通知', idSuffix: 'notify-upcoming' },
] as const

export function NotificationSettings({
  idPrefix,
  settings,
  disabled,
  onSettingChange,
}: NotificationSettingsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">通知</h4>

      {NOTIFICATION_TOGGLES.map(({ field, label, idSuffix }) => (
        <div key={field} className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-${idSuffix}`} className="cursor-pointer">
            {label}
          </Label>
          <Switch
            id={`${idPrefix}-${idSuffix}`}
            checked={settings[field]}
            onCheckedChange={(checked) => onSettingChange(field, checked)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  )
}
