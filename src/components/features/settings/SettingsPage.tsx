'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/hooks/useSettings'

import { AccountSection } from './AccountSection'
import { ChannelSyncSection } from './ChannelSyncSection'
import { ContentSection } from './ContentSection'
import { NotificationSection } from './NotificationSection'
import { PollingSection } from './PollingSection'

function SettingsSkeleton() {
  return (
    <div className="space-y-8">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-[200px]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SettingsPage() {
  const { data: settings, isLoading, isError, refetch } = useSettings()

  return (
    <main className="mx-auto max-w-[640px] p-4">
      <h1 className="text-2xl font-bold mb-6">設定</h1>

      {isLoading ? (
        <SettingsSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">
            設定の取得に失敗しました。ページを再読み込みしてください。
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            再読み込み
          </Button>
        </div>
      ) : settings ? (
        <div className="space-y-8">
          <AccountSection settings={settings} />
          <PollingSection settings={settings} />
          <ContentSection settings={settings} />
          <ChannelSyncSection />
          <NotificationSection />
        </div>
      ) : null}
    </main>
  )
}
