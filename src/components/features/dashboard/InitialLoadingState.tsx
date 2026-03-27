'use client'

import { Loader2 } from 'lucide-react'

import { useChannels } from '@/hooks/useChannels'
import { INITIAL_LOADING_POLL_INTERVAL_MS } from '@/lib/config'

export function InitialLoadingState() {
  // Poll for channels every 5 seconds until channels appear
  // DashboardPage will switch to normal view once channels.length > 0
  useChannels(true, { refetchInterval: INITIAL_LOADING_POLL_INTERVAL_MS })

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">YouTubeの登録チャンネルを取得中です...</p>
    </div>
  )
}
