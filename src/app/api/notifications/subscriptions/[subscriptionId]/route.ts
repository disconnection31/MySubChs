import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

type RouteContext = {
  params: Promise<{ subscriptionId: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { subscriptionId } = await context.params

    // Delete with ownership check in a single query
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { id: subscriptionId, userId: auth.userId },
    })

    if (count === 0) {
      return errorResponse(
        ErrorCode.PUSH_SUBSCRIPTION_NOT_FOUND,
        '指定されたサブスクリプションが見つかりません',
        404,
      )
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[notifications/subscriptions] DELETE error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
