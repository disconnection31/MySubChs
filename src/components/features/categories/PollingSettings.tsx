'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { VALID_POLLING_INTERVALS } from '@/lib/config'
import type { NotificationSettingResponse } from '@/types/api'

import type { SettingChangeHandler } from './CategorySettings'

type PollingSettingsProps = {
  idPrefix: string
  settings: NotificationSettingResponse
  globalPollingInterval: number
  disabled: boolean
  onSettingChange: SettingChangeHandler
}

const USE_GLOBAL_VALUE = 'global'

function formatInterval(minutes: number): string {
  if (minutes >= 60) {
    return `${minutes / 60}時間`
  }
  return `${minutes}分`
}

export function PollingSettings({
  idPrefix,
  settings,
  globalPollingInterval,
  disabled,
  onSettingChange,
}: PollingSettingsProps) {
  const intervalValue =
    settings.pollingIntervalMinutes === null
      ? USE_GLOBAL_VALUE
      : String(settings.pollingIntervalMinutes)

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">ポーリング</h4>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-auto-polling`} className="cursor-pointer">
          定期ポーリング
        </Label>
        <Switch
          id={`${idPrefix}-auto-polling`}
          checked={settings.autoPollingEnabled}
          onCheckedChange={(checked) => onSettingChange('autoPollingEnabled', checked)}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-polling-interval`} className="cursor-pointer">
          ポーリング間隔
        </Label>
        <Select
          value={intervalValue}
          onValueChange={(val) => {
            const numValue = val === USE_GLOBAL_VALUE ? null : Number(val)
            onSettingChange('pollingIntervalMinutes', numValue)
          }}
          disabled={disabled || !settings.autoPollingEnabled}
        >
          <SelectTrigger id={`${idPrefix}-polling-interval`} className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={USE_GLOBAL_VALUE}>
              グローバル設定を使用（現在: {formatInterval(globalPollingInterval)}）
            </SelectItem>
            {VALID_POLLING_INTERVALS.map((min) => (
              <SelectItem key={min} value={String(min)}>
                {formatInterval(min)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
