'use client'

import { AlertTriangle } from 'lucide-react'

import type { UserSettingsResponse } from '@/types/api'

type QuotaWarningProps = {
  settings: UserSettingsResponse | undefined
}

export function QuotaWarning({ settings }: QuotaWarningProps) {
  if (!settings) {
    return null
  }

  const { estimatedDailyQuota, quotaDailyLimit, quotaWarningThreshold } = settings
  const isOverThreshold = estimatedDailyQuota > quotaWarningThreshold

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        推定1日クォータ使用量: {estimatedDailyQuota.toLocaleString()} / {quotaDailyLimit.toLocaleString()} units
      </p>
      {isOverThreshold && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              全カテゴリの合計クォータが警告しきい値を超えています。
            </p>
            <p>
              一部のカテゴリのポーリング間隔を長くすることを推奨します。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
