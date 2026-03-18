'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useRegisterPushSubscription, useSendTestNotification } from '@/hooks/useSettings'

type NotificationStatus = 'loading' | 'enabled' | 'not-enabled' | 'denied'

export function NotificationSection() {
  const [status, setStatus] = useState<NotificationStatus>('loading')
  const [isEnabling, setIsEnabling] = useState(false)
  const registerSubscription = useRegisterPushSubscription()
  const sendTest = useSendTestNotification()

  const checkStatus = useCallback(async () => {
    // Check if Notification API is available
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatus('not-enabled')
      return
    }

    const permission = Notification.permission

    if (permission === 'denied') {
      setStatus('denied')
      return
    }

    if (permission === 'granted') {
      // Check if service worker subscription exists
      try {
        const registration = await navigator.serviceWorker?.ready
        const subscription = await registration?.pushManager?.getSubscription()
        setStatus(subscription ? 'enabled' : 'not-enabled')
      } catch {
        setStatus('not-enabled')
      }
      return
    }

    // permission === 'default'
    setStatus('not-enabled')
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleEnable = async () => {
    setIsEnabling(true)
    try {
      const permission = await Notification.requestPermission()

      if (permission === 'denied') {
        setStatus('denied')
        setIsEnabling(false)
        return
      }

      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        const json = subscription.toJSON()
        await registerSubscription.mutateAsync({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          userAgent: navigator.userAgent,
        })

        setStatus('enabled')
      }
    } catch (error) {
      console.error('[NotificationSection] Enable failed:', error)
      toast.error('通知の有効化に失敗しました')
      setStatus('not-enabled')
    } finally {
      setIsEnabling(false)
    }
  }

  if (status === 'loading') {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4">通知設定</h2>
        <div className="border-t pt-4">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">通知設定</h2>
      <div className="border-t pt-4 space-y-3">
        {/* Status display */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">通知の状態</span>
          <span className="ml-auto flex items-center gap-1.5">
            {status === 'enabled' && (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">有効化済み</span>
              </>
            )}
            {status === 'not-enabled' && (
              <>
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                <span className="text-sm font-medium text-muted-foreground">未有効化</span>
              </>
            )}
            {status === 'denied' && (
              <>
                <X className="h-3.5 w-3.5 text-red-500" />
                <span className="text-sm font-medium text-red-500">拒否済み</span>
              </>
            )}
          </span>
        </div>

        {/* Status-specific content */}
        {status === 'enabled' && (
          <Button
            variant="outline"
            onClick={() => sendTest.mutate()}
            disabled={sendTest.isPending}
          >
            {sendTest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            テスト通知を送信する
          </Button>
        )}

        {status === 'not-enabled' && (
          <>
            <p className="text-sm text-muted-foreground">
              ブラウザのWeb Push通知を有効化すると、新着動画・ライブ配信を
              リアルタイムで受け取ることができます。
            </p>
            <Button onClick={handleEnable} disabled={isEnabling}>
              {isEnabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              通知を有効化する
            </Button>
          </>
        )}

        {status === 'denied' && (
          <p className="text-sm text-muted-foreground">
            ブラウザの設定で通知が拒否されています。
            <br />
            ブラウザの設定から通知を許可してください。
          </p>
        )}
      </div>
    </section>
  )
}
