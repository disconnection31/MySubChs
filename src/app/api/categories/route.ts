import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { getEffectiveIntervalMs, registerPollingJob } from '@/lib/bullmq-helpers'
import { CATEGORY_NAME_MAX_LENGTH } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatCategory, type CategoryWithNotificationSetting } from './helpers'

export async function GET() {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const categories = await prisma.category.findMany({
      where: { userId: auth.userId },
      orderBy: { sortOrder: 'asc' },
      include: { notificationSetting: true },
    })

    return NextResponse.json(
      categories.map((c) => formatCategory(c as CategoryWithNotificationSetting)),
    )
  } catch (error) {
    console.error('[categories] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const body: unknown = await request.json()
    const { name } = body as { name?: string }

    // Validate name
    if (!name || name.trim().length === 0) {
      return errorResponse(ErrorCode.CATEGORY_NAME_EMPTY, 'カテゴリ名を入力してください', 400)
    }

    const trimmedName = name.trim()

    if (trimmedName.length > CATEGORY_NAME_MAX_LENGTH) {
      return errorResponse(
        ErrorCode.CATEGORY_NAME_TOO_LONG,
        `カテゴリ名は${CATEGORY_NAME_MAX_LENGTH}文字以内で入力してください`,
        400,
      )
    }

    // Calculate next sortOrder
    const maxSortOrder = await prisma.category.aggregate({
      where: { userId: auth.userId },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1

    // Create category + notification setting in transaction
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          userId: auth.userId,
          name: trimmedName,
          sortOrder: nextSortOrder,
        },
      })

      await tx.notificationSetting.create({
        data: {
          userId: auth.userId,
          categoryId: created.id,
        },
      })

      return tx.category.findUniqueOrThrow({
        where: { id: created.id },
        include: { notificationSetting: true },
      })
    })

    // BullMQ polling job registration
    // autoPollingEnabled defaults to true for new categories
    try {
      const effectiveIntervalMs = await getEffectiveIntervalMs(auth.userId, null)
      await registerPollingJob(category.id, effectiveIntervalMs)
    } catch (err) {
      // Redis failure is non-fatal — self-healing on Worker restart will recover
      console.error('[categories] Failed to register polling job:', err)
    }

    return NextResponse.json(
      formatCategory(category as CategoryWithNotificationSetting),
      { status: 201 },
    )
  } catch (error) {
    // Handle unique constraint violation (duplicate name)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse(
        ErrorCode.CATEGORY_NAME_DUPLICATE,
        '同じ名前のカテゴリがすでに存在します',
        409,
      )
    }

    console.error('[categories] POST error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
