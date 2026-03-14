import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse, validationErrorResponse } from '@/lib/errors'
import type { ValidationDetail } from '@/lib/errors'

export async function POST(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const body: unknown = await request.json()
    const { endpoint, p256dh, auth: authKey, userAgent } = body as {
      endpoint?: string
      p256dh?: string
      auth?: string
      userAgent?: string
    }

    // Validate required fields
    const details: ValidationDetail[] = []
    if (!endpoint || endpoint.trim().length === 0) {
      details.push({ field: 'endpoint', message: 'endpoint は必須です' })
    }
    if (!p256dh || p256dh.trim().length === 0) {
      details.push({ field: 'p256dh', message: 'p256dh は必須です' })
    }
    if (!authKey || authKey.trim().length === 0) {
      details.push({ field: 'auth', message: 'auth は必須です' })
    }

    if (details.length > 0) {
      return validationErrorResponse(details)
    }

    // Upsert subscription by endpoint (unique key)
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: endpoint! },
      update: {
        p256dh: p256dh!,
        auth: authKey!,
        userAgent: userAgent ?? null,
      },
      create: {
        userId: auth.userId,
        endpoint: endpoint!,
        p256dh: p256dh!,
        auth: authKey!,
        userAgent: userAgent ?? null,
      },
    })

    return NextResponse.json(
      { id: subscription.id, endpoint: subscription.endpoint },
      { status: 201 },
    )
  } catch (error) {
    console.error('[notifications/subscriptions] POST error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
