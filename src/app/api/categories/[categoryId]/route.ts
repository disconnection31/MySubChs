import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { CATEGORY_NAME_MAX_LENGTH } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

function formatCategory(category: {
  id: string
  name: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  notificationSetting: {
    notifyOnNewVideo: boolean
    notifyOnLiveStart: boolean
    notifyOnUpcoming: boolean
    watchLaterDefault: boolean
    autoExpireHours: number | null
    autoPollingEnabled: boolean
    pollingIntervalMinutes: number | null
  } | null
}) {
  const s = category.notificationSetting
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    settings: s
      ? {
          notifyOnNewVideo: s.notifyOnNewVideo,
          notifyOnLiveStart: s.notifyOnLiveStart,
          notifyOnUpcoming: s.notifyOnUpcoming,
          watchLaterDefault: s.watchLaterDefault,
          autoExpireHours: s.autoExpireHours,
          autoPollingEnabled: s.autoPollingEnabled,
          pollingIntervalMinutes: s.pollingIntervalMinutes,
        }
      : null,
  }
}

type RouteContext = {
  params: Promise<{ categoryId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)

  const { categoryId } = await context.params

  const body = (await request.json()) as { name?: unknown }
  const name = body.name

  if (!name || (typeof name === 'string' && name.trim() === '')) {
    return errorResponse(ErrorCode.CATEGORY_NAME_EMPTY, 'カテゴリ名を入力してください', 400)
  }

  if (typeof name !== 'string' || name.trim() === '') {
    return errorResponse(ErrorCode.CATEGORY_NAME_EMPTY, 'カテゴリ名を入力してください', 400)
  }

  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return errorResponse(
      ErrorCode.CATEGORY_NAME_TOO_LONG,
      'カテゴリ名は50文字以内で入力してください',
      400,
    )
  }

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, userId: auth.userId },
  })
  if (!existing) {
    return errorResponse(ErrorCode.CATEGORY_NOT_FOUND, 'カテゴリが見つかりません', 404)
  }

  try {
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: { name: name.trim() },
      include: { notificationSetting: true },
    })

    return NextResponse.json(formatCategory(category))
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse(ErrorCode.CATEGORY_NAME_DUPLICATE, 'カテゴリ名が重複しています', 409)
    }
    throw error
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)

  const { categoryId } = await context.params

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, userId: auth.userId },
  })
  if (!existing) {
    return errorResponse(ErrorCode.CATEGORY_NOT_FOUND, 'カテゴリが見つかりません', 404)
  }

  await prisma.category.delete({ where: { id: categoryId } })

  // BullMQ ジョブ削除は将来実装（現時点はno-opスタブ）

  return new NextResponse(null, { status: 204 })
}
