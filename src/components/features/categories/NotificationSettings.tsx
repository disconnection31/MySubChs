'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { NotificationSettingResponse } from '@/types/api'

type NotificationSettingsProps = {
  idPrefix: string
  settings: NotificationSettingResponse
  disabled: boolean
  onSettingChange: (field: string, value: boolean | number | null, affectsQuota: boolean) => void
}

export function NotificationSettings({
  idPrefix,
  settings,
  disabled,
  onSettingChange,
}: NotificationSettingsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">通知</h4>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-notify-new-video`} className="cursor-pointer">
          新着動画通知
        </Label>
        <Switch
          id={`${idPrefix}-notify-new-video`}
          checked={settings.notifyOnNewVideo}
          onCheckedChange={(checked) =>
            onSettingChange('notifyOnNewVideo', checked, false)
          }
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-notify-live-start`} className="cursor-pointer">
          ライブ開始通知
        </Label>
        <Switch
          id={`${idPrefix}-notify-live-start`}
          checked={settings.notifyOnLiveStart}
          onCheckedChange={(checked) =>
            onSettingChange('notifyOnLiveStart', checked, false)
          }
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-notify-upcoming`} className="cursor-pointer">
          配信予定の通知
        </Label>
        <Switch
          id={`${idPrefix}-notify-upcoming`}
          checked={settings.notifyOnUpcoming}
          onCheckedChange={(checked) =>
            onSettingChange('notifyOnUpcoming', checked, false)
          }
          disabled={disabled}
        />
      </div>
    </div>
  )
}
