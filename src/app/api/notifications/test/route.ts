import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'
import { sendPushNotification } from '@/lib/web-push'
import type { PushPayload, PushSubscriptionData } from '@/lib/web-push'

const TEST_NOTIFICATION_PAYLOAD: PushPayload = {
  title: 'MySubChs',
  body: '通知の設定が完了しています',
  icon: '/icon-192x192.png',
  data: { url: '/' },
}

export async function POST() {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: auth.userId },
    })

    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 })
    }

    let sent = 0
    let failed = 0
    const expiredIds: string[] = []

    await Promise.all(
      subscriptions.map(async (sub) => {
        const pushSub: PushSubscriptionData = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }

        try {
          const success = await sendPushNotification(pushSub, TEST_NOTIFICATION_PAYLOAD)
          if (success) {
            sent++
          } else {
            // Subscription is gone (410/404) — mark for deletion
            failed++
            expiredIds.push(sub.id)
          }
        } catch (error) {
          console.error(`[notifications/test] Failed to send to ${sub.endpoint}:`, error)
          failed++
        }
      }),
    )

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: expiredIds } },
      })
    }

    return NextResponse.json({ sent, failed })
  } catch (error) {
    console.error('[notifications/test] POST error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
