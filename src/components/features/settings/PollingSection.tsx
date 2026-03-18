'use client'

import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateSettings } from '@/hooks/useSettings'
import type { UserSettingsResponse } from '@/types/api'

const POLLING_INTERVAL_OPTIONS = [
  { label: '5分', value: '5' },
  { label: '10分', value: '10' },
  { label: '30分（デフォルト）', value: '30' },
  { label: '1時間', value: '60' },
] as const

type Props = {
  settings: UserSettingsResponse
}

export function PollingSection({ settings }: Props) {
  const updateSettings = useUpdateSettings()

  const handleIntervalChange = (value: string) => {
    updateSettings.mutate({ pollingIntervalMinutes: Number(value) })
  }

  const isQuotaExhausted = settings.quotaExhaustedUntil != null
  const isQuotaWarning = settings.estimatedDailyQuota > settings.quotaWarningThreshold

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">ポーリング設定</h2>
      <div className="border-t pt-4 space-y-4">
        {/* Quota exhausted banner */}
        {isQuotaExhausted && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              YouTube API クォータが本日分を超過しました。
              <br />
              ポーリングは翌日 UTC 00:00 に自動再開します。（日本時間 09:00 頃）
            </AlertDescription>
          </Alert>
        )}

        {/* Polling interval select */}
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">デフォルトポーリング間隔</span>
            <Select
              value={String(settings.pollingIntervalMinutes)}
              onValueChange={handleIntervalChange}
              disabled={updateSettings.isPending}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLLING_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            カテゴリごとに上書きしない場合に使用されるデフォルト間隔。
            <br />
            変更は次のポーリングサイクル開始時から反映されます。
          </p>
        </div>

        {/* Quota usage display */}
        <p className="text-sm">
          推定1日クォータ使用量:{' '}
          <span className={isQuotaWarning ? 'font-semibold text-orange-500' : 'font-medium'}>
            {settings.estimatedDailyQuota.toLocaleString()}
          </span>{' '}
          / {settings.quotaDailyLimit.toLocaleString()} units
        </p>

        {/* Quota warning */}
        {isQuotaWarning && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              全カテゴリの合計クォータが警告しきい値を超えています。
              <br />
              一部のカテゴリのポーリング間隔を長くすることを推奨します。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  )
}
