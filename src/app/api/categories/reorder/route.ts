import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatCategory, type CategoryWithNotificationSetting } from '../helpers'

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const body: unknown = await request.json()
    const { orderedIds } = body as { orderedIds?: string[] }

    // Validate orderedIds
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'orderedIds は空でない配列で指定してください',
        400,
      )
    }

    // Verify all IDs belong to user and match exactly
    const userCategories = await prisma.category.findMany({
      where: { userId: auth.userId },
      select: { id: true },
    })

    const userCategoryIds = new Set(userCategories.map((c) => c.id))
    const orderedIdSet = new Set(orderedIds)

    // Check for exact match: same count and all IDs present
    if (
      orderedIds.length !== userCategories.length ||
      orderedIdSet.size !== orderedIds.length ||
      !orderedIds.every((id) => userCategoryIds.has(id))
    ) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'orderedIds はユーザーの全カテゴリIDと完全に一致する必要があります',
        400,
      )
    }

    // Update sortOrder in transaction
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.category.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    )

    // Fetch updated categories
    const categories = await prisma.category.findMany({
      where: { userId: auth.userId },
      orderBy: { sortOrder: 'asc' },
      include: { notificationSetting: true },
    })

    return NextResponse.json(
      categories.map((c) => formatCategory(c as CategoryWithNotificationSetting)),
    )
  } catch (error) {
    console.error('[categories/reorder] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
