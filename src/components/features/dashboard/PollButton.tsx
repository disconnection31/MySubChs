'use client'

import { Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useManualPolling } from '@/hooks/useManualPolling'
import { useSettings } from '@/hooks/useSettings'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'

type PollButtonProps = {
  categoryId: string | null
}

function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) {
    return `あと${minutes}分${secs}秒`
  }
  return `あと${secs}秒`
}

export function PollButton({ categoryId }: PollButtonProps) {
  const { state, cooldownRemaining, trigger } = useManualPolling(categoryId)
  const { data: settings } = useSettings()

  const isUncategorized = categoryId === UNCATEGORIZED_CATEGORY_ID
  const isQuotaExhausted = state === 'quotaExhausted' || !!settings?.quotaExhaustedUntil

  const isDisabled = isUncategorized || state !== 'idle' || isQuotaExhausted

  const getButtonContent = () => {
    if (state === 'polling') {
      return (
        <>
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ポーリング中...
        </>
      )
    }

    if (state === 'cooldown') {
      return formatCooldown(cooldownRemaining)
    }

    return (
      <>
        <RefreshCw className="mr-1 h-4 w-4" />
        今すぐポーリング
      </>
    )
  }

  const getTitle = () => {
    if (isUncategorized) return '未分類カテゴリはポーリングできません'
    if (isQuotaExhausted) return 'YouTube APIクォータが枯渇しています'
    return undefined
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={trigger}
      disabled={isDisabled}
      title={getTitle()}
      className="shrink-0"
    >
      {getButtonContent()}
    </Button>
  )
}
