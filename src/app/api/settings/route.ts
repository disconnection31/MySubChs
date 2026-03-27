import { NextResponse } from 'next/server'

import {
  getAuthenticatedSession,
  isValidContentRetentionDays,
  isValidPollingInterval,
} from '@/lib/api-helpers'
import { bulkUpdateGlobalInterval } from '@/lib/bullmq-helpers'
import {
  DEFAULT_CONTENT_RETENTION_DAYS,
  DEFAULT_POLLING_INTERVAL_MINUTES,
  REDIS_KEY_QUOTA_EXHAUSTED,
  YOUTUBE_QUOTA_DAILY_LIMIT,
  YOUTUBE_QUOTA_WARNING_THRESHOLD,
} from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'
import { redis } from '@/lib/redis'

import { calculateEstimatedDailyQuota } from './helpers'

export async function GET() {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    // UserSetting・カテゴリデータ・アカウント情報を並列取得
    const [userSetting, categories, account] = await Promise.all([
      prisma.userSetting.upsert({
        where: { userId: auth.userId },
        update: {},
        create: {
          userId: auth.userId,
          pollingIntervalMinutes: DEFAULT_POLLING_INTERVAL_MINUTES,
          contentRetentionDays: DEFAULT_CONTENT_RETENTION_DAYS,
        },
      }),
      prisma.category.findMany({
        where: { userId: auth.userId },
        include: {
          notificationSetting: true,
          _count: {
            select: {
              channels: {
                where: { isActive: true },
              },
            },
          },
        },
      }),
      prisma.account.findFirst({
        where: { userId: auth.userId, provider: 'google' },
        select: { token_error: true },
      }),
    ])

    const categoryQuotaInputs = categories.map((c) => ({
      channelCount: c._count.channels,
      effectiveInterval:
        c.notificationSetting?.pollingIntervalMinutes ?? userSetting.pollingIntervalMinutes,
      autoPollingEnabled: c.notificationSetting?.autoPollingEnabled ?? true,
    }))

    const estimatedDailyQuota = calculateEstimatedDailyQuota(categoryQuotaInputs)
    const tokenStatus = account?.token_error != null ? 'error' : 'valid'

    // Read quota exhaustion status from Redis
    let quotaExhaustedUntil: string | null = null
    try {
      quotaExhaustedUntil = await redis.get(REDIS_KEY_QUOTA_EXHAUSTED)
    } catch (err) {
      // Redis failure is non-fatal — return null
      console.error('[settings] Failed to read quota exhaustion status:', err)
    }

    return NextResponse.json({
      pollingIntervalMinutes: userSetting.pollingIntervalMinutes,
      contentRetentionDays: userSetting.contentRetentionDays,
      estimatedDailyQuota,
      quotaWarningThreshold: YOUTUBE_QUOTA_WARNING_THRESHOLD,
      quotaDailyLimit: YOUTUBE_QUOTA_DAILY_LIMIT,
      tokenStatus,
      quotaExhaustedUntil,
    })
  } catch (error) {
    console.error('[settings] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const body: unknown = await request.json()
    const { pollingIntervalMinutes, contentRetentionDays } = body as {
      pollingIntervalMinutes?: number
      contentRetentionDays?: number
    }

    // At least one field must be specified
    if (pollingIntervalMinutes === undefined && contentRetentionDays === undefined) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        '更新するフィールドを少なくとも1つ指定してください',
        400,
      )
    }

    // Validate pollingIntervalMinutes
    if (pollingIntervalMinutes !== undefined && !isValidPollingInterval(pollingIntervalMinutes)) {
      return errorResponse(
        ErrorCode.INVALID_POLLING_INTERVAL,
        'ポーリング間隔が不正です。5, 10, 30, 60 のいずれかを指定してください',
        400,
      )
    }

    // Validate contentRetentionDays
    if (contentRetentionDays !== undefined && !isValidContentRetentionDays(contentRetentionDays)) {
      return errorResponse(
        ErrorCode.INVALID_RETENTION_DAYS,
        'コンテンツ保持期間が不正です。30, 60, 90, 180, 365 のいずれかを指定してください',
        400,
      )
    }

    // Build update data
    const updateData: { pollingIntervalMinutes?: number; contentRetentionDays?: number } = {}
    if (pollingIntervalMinutes !== undefined) {
      updateData.pollingIntervalMinutes = pollingIntervalMinutes
    }
    if (contentRetentionDays !== undefined) {
      updateData.contentRetentionDays = contentRetentionDays
    }

    // Ensure UserSetting exists (defensive upsert)
    const userSetting = await prisma.userSetting.upsert({
      where: { userId: auth.userId },
      update: updateData,
      create: {
        userId: auth.userId,
        pollingIntervalMinutes:
          pollingIntervalMinutes ?? DEFAULT_POLLING_INTERVAL_MINUTES,
        contentRetentionDays:
          contentRetentionDays ?? DEFAULT_CONTENT_RETENTION_DAYS,
      },
    })

    // Bulk update BullMQ jobs when global pollingIntervalMinutes changes
    if (pollingIntervalMinutes !== undefined) {
      try {
        await bulkUpdateGlobalInterval(auth.userId, pollingIntervalMinutes)
      } catch (err) {
        // Redis failure is non-fatal — self-healing on Worker restart will recover
        console.error('[settings] Failed to bulk update polling jobs:', err)
      }
    }

    return NextResponse.json({
      pollingIntervalMinutes: userSetting.pollingIntervalMinutes,
      contentRetentionDays: userSetting.contentRetentionDays,
    })
  } catch (error) {
    console.error('[settings] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
