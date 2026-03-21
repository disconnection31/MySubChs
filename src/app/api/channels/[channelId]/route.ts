import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatChannel } from '../helpers'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { channelId } = await params
    const body: unknown = await request.json()
    const { categoryId, isActive } = body as {
      categoryId?: string | null
      isActive?: boolean
    }

    // Validate that at least one field is provided
    if (categoryId === undefined && isActive === undefined) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, '更新するフィールドを指定してください', 400)
    }

    // Find channel and verify ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel || channel.userId !== auth.userId) {
      return errorResponse(ErrorCode.CHANNEL_NOT_FOUND, 'チャンネルが見つかりません', 404)
    }

    // Build update data
    const updateData: Prisma.ChannelUpdateInput = {}

    if (categoryId !== undefined) {
      if (categoryId === null) {
        updateData.category = { disconnect: true }
      } else {
        // Verify category exists and belongs to user
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
        })

        if (!category || category.userId !== auth.userId) {
          return errorResponse(ErrorCode.CATEGORY_NOT_FOUND, 'カテゴリが見つかりません', 404)
        }

        updateData.category = { connect: { id: categoryId } }
      }
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: updateData,
    })

    return NextResponse.json(formatChannel(updated))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse(ErrorCode.CHANNEL_NOT_FOUND, 'チャンネルが見つかりません', 404)
    }

    console.error('[channels] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
