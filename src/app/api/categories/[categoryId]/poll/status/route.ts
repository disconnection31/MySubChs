import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { REDIS_KEY_MANUAL_POLL_COOLDOWN_PREFIX } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'
import { queue } from '@/lib/queue'
import { redis } from '@/lib/redis'

import type { PollStatusResponse } from '@/types/api'

type RouteContext = {
  params: Promise<{ categoryId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { categoryId } = await context.params

    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: auth.userId },
      select: { id: true },
    })
    if (!category) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

    const jobName = `manual-poll:${categoryId}`
    const cooldownKey = `${REDIS_KEY_MANUAL_POLL_COOLDOWN_PREFIX}${categoryId}`
    const [job, ttl] = await Promise.all([
      queue.getJob(jobName),
      redis.ttl(cooldownKey),
    ])

    let status: PollStatusResponse['status'] = 'none'
    if (job) {
      const state = await job.getState()
      if (state === 'completed' || state === 'failed' || state === 'active' || state === 'waiting') {
        status = state
      } else {
        status = 'waiting'
      }
    }

    const response: PollStatusResponse = {
      status,
      cooldownRemaining: Math.max(0, ttl),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[poll/status] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
