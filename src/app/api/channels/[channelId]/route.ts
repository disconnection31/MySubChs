import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatChannel } from '../helpers'

type RouteContext = {
  params: Promise<{ channelId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { channelId } = await context.params

    // Check channel exists and belongs to user
    const existing = await prisma.channel.findFirst({
      where: { id: channelId, userId: auth.userId },
    })
    if (!existing) {
      return errorResponse(
        ErrorCode.CHANNEL_NOT_FOUND,
        '指定されたチャンネルが見つかりません',
        404,
      )
    }

    const body: unknown = await request.json()
    const { categoryId, isActive } = body as {
      categoryId?: string | null
      isActive?: boolean
    }

    // Validate: at least one field must be provided
    if (categoryId === undefined && isActive === undefined) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        '更新するフィールドを指定してください',
        400,
      )
    }

    // Build update data
    const updateData: { categoryId?: string | null; isActive?: boolean } = {}

    // Validate categoryId if provided
    if (categoryId !== undefined) {
      if (categoryId !== null) {
        // Verify the category exists and belongs to the user
        const category = await prisma.category.findFirst({
          where: { id: categoryId, userId: auth.userId },
        })
        if (!category) {
          return errorResponse(
            ErrorCode.CATEGORY_NOT_FOUND,
            '指定されたカテゴリが見つかりません',
            404,
          )
        }
      }
      updateData.categoryId = categoryId
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'isActive はブーリアン値で指定してください',
          400,
        )
      }
      updateData.isActive = isActive
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: updateData,
    })

    return NextResponse.json(formatChannel(updated))
  } catch (error) {
    console.error('[channels] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
