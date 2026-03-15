import { type NotificationSetting } from '@prisma/client'
import { NextResponse } from 'next/server'

import {
  getAuthenticatedSession,
  isValidAutoExpireHours,
  isValidPollingInterval,
} from '@/lib/api-helpers'
import { VALID_AUTO_EXPIRE_HOURS, VALID_POLLING_INTERVALS } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatNotificationSetting } from '../../helpers'

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

    const setting = await prisma.notificationSetting.findFirst({
      where: { categoryId, userId: auth.userId },
    })

    if (!setting) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

    return NextResponse.json(formatNotificationSetting(setting))
  } catch (error) {
    console.error('[category-settings] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { categoryId } = await context.params

    // Check category exists (NotificationSetting is auto-created with Category)
    const existing = await prisma.notificationSetting.findFirst({
      where: { categoryId, userId: auth.userId },
    })

    if (!existing) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

    const body = (await request.json()) as Record<string, unknown>

    // Extract updatable fields (use `in` to distinguish "key absent" from "key: null")
    const fields = [
      'notifyOnNewVideo',
      'notifyOnLiveStart',
      'notifyOnUpcoming',
      'watchLaterDefault',
      'autoExpireHours',
      'autoPollingEnabled',
      'pollingIntervalMinutes',
    ] as const

    const hasAnyField = fields.some((f) => f in body)
    if (!hasAnyField) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        '更新するフィールドを少なくとも1つ指定してください',
        400,
      )
    }

    // Validate boolean fields
    const booleanFields = [
      'notifyOnNewVideo',
      'notifyOnLiveStart',
      'notifyOnUpcoming',
      'watchLaterDefault',
      'autoPollingEnabled',
    ] as const

    for (const field of booleanFields) {
      if (field in body && typeof body[field] !== 'boolean') {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          `${field} はブーリアン型で指定してください`,
          400,
        )
      }
    }

    // Validate autoExpireHours: null (no expiry) or valid hours
    if ('autoExpireHours' in body) {
      const value = body.autoExpireHours
      if (value !== null && !isValidAutoExpireHours(value)) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          `autoExpireHours は ${VALID_AUTO_EXPIRE_HOURS.join(', ')} のいずれか、または null を指定してください`,
          400,
        )
      }
    }

    // Validate pollingIntervalMinutes: null (use global default) or valid interval
    if ('pollingIntervalMinutes' in body) {
      const value = body.pollingIntervalMinutes
      if (value !== null && !isValidPollingInterval(value)) {
        return errorResponse(
          ErrorCode.INVALID_POLLING_INTERVAL,
          `ポーリング間隔が不正です。${VALID_POLLING_INTERVALS.join(', ')} のいずれか、または null を指定してください`,
          400,
        )
      }
    }

    // Build update data — only include fields present in the request body
    const updateData: Partial<Pick<NotificationSetting, (typeof fields)[number]>> = {}
    for (const field of fields) {
      if (field in body) {
        ;(updateData as Record<string, unknown>)[field] = body[field]
      }
    }

    const updated = await prisma.notificationSetting.update({
      where: { id: existing.id },
      data: updateData,
    })

    // TODO: BullMQ polling job update (T22)
    // pollingIntervalMinutes が変更された場合、Repeatable Job の間隔を更新する

    return NextResponse.json(formatNotificationSetting(updated))
  } catch (error) {
    console.error('[category-settings] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
