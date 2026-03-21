import { NextRequest } from 'next/server'

import { formatWatchLater } from '@/app/api/contents/helpers'
import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

type RouteContext = {
  params: Promise<{ contentId: string }>
}

/**
 * PUT /api/watch-later/{contentId}
 * 「後で見る」を ON にする（手動追加）
 */
export async function PUT(_request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { contentId } = await context.params

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        channel: {
          select: { userId: true },
        },
      },
    })

    if (!content || content.channel.userId !== auth.userId) {
      return errorResponse(ErrorCode.CONTENT_NOT_FOUND, 'コンテンツが見つかりません', 404)
    }

    const watchLater = await prisma.watchLater.upsert({
      where: {
        userId_contentId: {
          userId: auth.userId,
          contentId,
        },
      },
      create: {
        userId: auth.userId,
        contentId,
        addedVia: 'MANUAL',
        removedVia: null,
        expiresAt: null,
      },
      update: {
        addedVia: 'MANUAL',
        removedVia: null,
        expiresAt: null,
        addedAt: new Date(),
      },
    })

    return Response.json(formatWatchLater(watchLater))
  } catch (error) {
    console.error('[watch-later] PUT error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}

/**
 * DELETE /api/watch-later/{contentId}
 * 「後で見る」を OFF にする（ソフト削除）
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { contentId } = await context.params

    const watchLater = await prisma.watchLater.findUnique({
      where: {
        userId_contentId: {
          userId: auth.userId,
          contentId,
        },
      },
    })

    if (!watchLater || watchLater.removedVia !== null) {
      return errorResponse(
        ErrorCode.CONTENT_NOT_FOUND,
        '「後で見る」レコードが見つかりません',
        404,
      )
    }

    await prisma.watchLater.update({
      where: {
        userId_contentId: {
          userId: auth.userId,
          contentId,
        },
      },
      data: {
        removedVia: 'MANUAL',
      },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('[watch-later] DELETE error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
