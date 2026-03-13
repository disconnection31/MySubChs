import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { CATEGORY_NAME_MAX_LENGTH } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatCategory, type CategoryWithNotificationSetting } from '../helpers'

type RouteContext = {
  params: Promise<{ categoryId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { categoryId } = await context.params

    // Check category exists and belongs to user
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, userId: auth.userId },
    })
    if (!existing) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

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

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: { name: trimmedName },
      include: { notificationSetting: true },
    })

    return NextResponse.json(formatCategory(updated as CategoryWithNotificationSetting))
  } catch (error) {
    // Handle unique constraint violation (duplicate name)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse(
        ErrorCode.CATEGORY_NAME_DUPLICATE,
        '同じ名前のカテゴリがすでに存在します',
        409,
      )
    }

    console.error('[categories] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { categoryId } = await context.params

    // Check category exists and belongs to user
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, userId: auth.userId },
    })
    if (!existing) {
      return errorResponse(
        ErrorCode.CATEGORY_NOT_FOUND,
        '指定されたカテゴリが見つかりません',
        404,
      )
    }

    // Delete category (onDelete: SetNull will set channel.categoryId to NULL,
    // onDelete: Cascade will delete NotificationSetting)
    await prisma.category.delete({
      where: { id: categoryId },
    })

    // BullMQ polling job deletion - no-op stub (T22)
    // TODO: Remove polling job for this category

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[categories] DELETE error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
