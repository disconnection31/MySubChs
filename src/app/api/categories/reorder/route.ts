import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
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

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)

  const body = (await request.json()) as { orderedIds?: unknown }
  const orderedIds = body.orderedIds

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'orderedIds は空でない配列である必要があります', 400)
  }

  if (orderedIds.some((id) => typeof id !== 'string')) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'orderedIds の各要素は文字列である必要があります', 400)
  }

  await prisma.$transaction(
    (orderedIds as string[]).map((id, index: number) =>
      prisma.category.updateMany({
        where: { id, userId: auth.userId },
        data: { sortOrder: index },
      }),
    ),
  )

  const categories = await prisma.category.findMany({
    where: { userId: auth.userId },
    include: { notificationSetting: true },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(categories.map(formatCategory))
}
