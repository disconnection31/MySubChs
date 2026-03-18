'use client'

import { useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSyncChannels, type SyncChannelsResponse } from '@/hooks/useSettings'

export function ChannelSyncSection() {
  const syncChannels = useSyncChannels()
  const [syncResult, setSyncResult] = useState<SyncChannelsResponse | null>(null)

  const handleSync = () => {
    setSyncResult(null)
    syncChannels.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult(data)
      },
    })
  }

  const formatResult = (result: SyncChannelsResponse): string => {
    const { added, restored, deactivated, updated } = result
    if (added === 0 && restored === 0 && deactivated === 0 && updated === 0) {
      return '変更はありませんでした'
    }
    return `追加 ${added}件 / 復元 ${restored}件 / 無効化 ${deactivated}件 / 更新 ${updated}件`
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">チャンネル同期</h2>
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          YouTubeでのチャンネル登録・解除はここから同期できます。
          <br />
          定期ポーリングではチャンネル一覧は自動更新されません。
        </p>

        <Button onClick={handleSync} disabled={syncChannels.isPending}>
          {syncChannels.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {syncChannels.isPending ? '同期中...' : 'チャンネルを再同期する'}
        </Button>

        {syncResult && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-500" />
            {formatResult(syncResult)}
          </p>
        )}
      </div>
    </section>
  )
}
