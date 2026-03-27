'use client'

import { AlertCircle } from 'lucide-react'

import { useSettings } from '@/hooks/useSettings'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function QuotaExhaustedBanner() {
  const { data: settings } = useSettings()

  if (!settings?.quotaExhaustedUntil) {
    return null
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        YouTube API
        クォータが本日分を超過しました。ポーリングは翌日UTC00:00に自動再開します。（日本時間09:00頃）
      </AlertDescription>
    </Alert>
  )
}
