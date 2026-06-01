'use client'

import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useUpdateSettings } from '@/hooks/useSettings'
import {
  MANUAL_POLL_COOLDOWN_MAX_SECONDS,
  MANUAL_POLL_COOLDOWN_MIN_SECONDS,
  MANUAL_POLL_COOLDOWN_STEP_SECONDS,
} from '@/lib/config'
import { formatCooldownLabel } from '@/lib/format'
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

  const [cooldownDraft, setCooldownDraft] = useState(settings.manualPollCooldownSeconds)

  useEffect(() => {
    setCooldownDraft(settings.manualPollCooldownSeconds)
  }, [settings.manualPollCooldownSeconds])

  const handleCooldownCommit = (value: number[]) => {
    const next = value[0]
    if (next !== settings.manualPollCooldownSeconds) {
      updateSettings.mutate({ manualPollCooldownSeconds: next })
    }
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

        {/* Manual poll cooldown slider */}
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">手動ポーリング クールダウン</span>
            <span className="text-sm font-medium">{formatCooldownLabel(cooldownDraft)}</span>
          </div>
          <Slider
            className="mt-2"
            min={MANUAL_POLL_COOLDOWN_MIN_SECONDS}
            max={MANUAL_POLL_COOLDOWN_MAX_SECONDS}
            step={MANUAL_POLL_COOLDOWN_STEP_SECONDS}
            value={[cooldownDraft]}
            onValueChange={([v]) => setCooldownDraft(v)}
            onValueCommit={handleCooldownCommit}
            disabled={updateSettings.isPending}
            aria-label="手動ポーリング クールダウン"
          />
          <p className="text-xs text-muted-foreground mt-1">
            カテゴリの「今すぐポーリング」を連続実行できない最短間隔。デフォルト 5 分。
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
