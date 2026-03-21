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
import { VALID_AUTO_EXPIRE_HOURS } from '@/lib/config'
import type { NotificationSettingResponse } from '@/types/api'

import type { SettingChangeHandler } from './CategorySettings'

type WatchLaterSettingsProps = {
  idPrefix: string
  settings: NotificationSettingResponse
  disabled: boolean
  onSettingChange: SettingChangeHandler
}

const NO_EXPIRE_VALUE = 'none'

const EXPIRE_LABELS: Record<number, string> = {
  24: '1日',
  72: '3日',
  168: '1週間',
  336: '2週間',
}

export function WatchLaterSettings({
  idPrefix,
  settings,
  disabled,
  onSettingChange,
}: WatchLaterSettingsProps) {
  const expireValue =
    settings.autoExpireHours === null ? NO_EXPIRE_VALUE : String(settings.autoExpireHours)

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">後で見る</h4>

      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-watch-later-default`} className="cursor-pointer">
          新着コンテンツに自動フラグを付ける
        </Label>
        <Switch
          id={`${idPrefix}-watch-later-default`}
          checked={settings.watchLaterDefault}
          onCheckedChange={(checked) => onSettingChange('watchLaterDefault', checked)}
          disabled={disabled}
        />
      </div>

      {settings.watchLaterDefault && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-auto-expire-hours`} className="cursor-pointer">
            自動失効時間
          </Label>
          <Select
            value={expireValue}
            onValueChange={(val) => {
              const numValue = val === NO_EXPIRE_VALUE ? null : Number(val)
              onSettingChange('autoExpireHours', numValue)
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-auto-expire-hours`} className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALID_AUTO_EXPIRE_HOURS.map((hours) => (
                <SelectItem key={hours} value={String(hours)}>
                  {EXPIRE_LABELS[hours]}
                </SelectItem>
              ))}
              <SelectItem value={NO_EXPIRE_VALUE}>失効なし</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
