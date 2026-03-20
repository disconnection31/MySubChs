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
import type { NotificationSettingResponse } from '@/types/api'

type WatchLaterSettingsProps = {
  idPrefix: string
  settings: NotificationSettingResponse
  disabled: boolean
  onSettingChange: (field: string, value: boolean | number | null, affectsQuota: boolean) => void
}

const NO_EXPIRE_VALUE = 'none'

export function WatchLaterSettings({
  idPrefix,
  settings,
  disabled,
  onSettingChange,
}: WatchLaterSettingsProps) {
  const expireValue = settings.autoExpireHours === null ? NO_EXPIRE_VALUE : String(settings.autoExpireHours)

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
          onCheckedChange={(checked) =>
            onSettingChange('watchLaterDefault', checked, false)
          }
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
              onSettingChange('autoExpireHours', numValue, false)
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-auto-expire-hours`} className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">1日</SelectItem>
              <SelectItem value="72">3日</SelectItem>
              <SelectItem value="168">1週間</SelectItem>
              <SelectItem value="336">2週間</SelectItem>
              <SelectItem value={NO_EXPIRE_VALUE}>失効なし</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
