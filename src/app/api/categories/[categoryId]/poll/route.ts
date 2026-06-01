import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import {
  DEFAULT_MANUAL_POLL_COOLDOWN_SECONDS,
  MANUAL_POLL_JOB_PREFIX,
  REDIS_KEY_MANUAL_POLL_COOLDOWN_PREFIX,
  REDIS_KEY_QUOTA_EXHAUSTED,
} from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, cooldownErrorResponse, errorResponse } from '@/lib/errors'
import { formatCooldownLabel } from '@/lib/format'
import { queue } from '@/lib/queue'
import { redis } from '@/lib/redis'

type RouteContext = {
  params: Promise<{ categoryId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { categoryId } = await context.params

    // Check category exists and belongs to user, and fetch user settings in parallel.
    const [category, userSetting] = await Promise.all([
      prisma.category.findFirst({
        where: { id: categoryId, userId: auth.userId },
      }),
      prisma.userSetting.findUnique({
        where: { userId: auth.userId },
      }),
    ])
    if (!category) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

    const cooldownSeconds =
      userSetting?.manualPollCooldownSeconds ?? DEFAULT_MANUAL_POLL_COOLDOWN_SECONDS

    const cooldownKey = `${REDIS_KEY_MANUAL_POLL_COOLDOWN_PREFIX}${categoryId}`
    const [quotaExhausted, ttl] = await Promise.all([
      redis.exists(REDIS_KEY_QUOTA_EXHAUSTED),
      redis.ttl(cooldownKey),
    ])

    if (quotaExhausted) {
      return errorResponse(
        ErrorCode.QUOTA_EXHAUSTED,
        'YouTube APIクォータが枯渇しています。翌日UTC00:00に自動再開します。',
        503,
      )
    }

    if (ttl > 0) {
      return cooldownErrorResponse(
        ttl,
        `手動ポーリングは${formatCooldownLabel(cooldownSeconds)}でのみ実行できます`,
      )
    }

    await redis.set(cooldownKey, '1', 'EX', cooldownSeconds)

    const jobId = `${MANUAL_POLL_JOB_PREFIX}${categoryId}`
    await queue.add(
      jobId,
      { categoryId },
      {
        jobId,
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 300 },
      },
    )

    return NextResponse.json({ queued: true })
  } catch (error) {
    console.error('[poll] POST error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
