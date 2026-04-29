'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'

import { GCP_QUOTA_CONSOLE_URL_TEMPLATE } from '@/lib/config'
import type { UserSettingsResponse } from '@/types/api'

const GCP_PROJECT_ID = process.env.NEXT_PUBLIC_GCP_PROJECT_ID
const QUOTA_CONSOLE_URL = GCP_PROJECT_ID
  ? `${GCP_QUOTA_CONSOLE_URL_TEMPLATE}${encodeURIComponent(GCP_PROJECT_ID)}`
  : null

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
    <div className="mb-4 space-y-2">
      <p className="text-sm text-muted-foreground">
        推定1日クォータ使用量: {estimatedDailyQuota.toLocaleString()} / {quotaDailyLimit.toLocaleString()} units
        {QUOTA_CONSOLE_URL && (
          <>
            {' · '}
            <a
              href={QUOTA_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Google Cloud Console のクォータページを別タブで開く"
              className="inline-flex items-center gap-1 hover:underline"
            >
              実際の使用量を確認
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
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
