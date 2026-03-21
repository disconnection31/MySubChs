import { type Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'

import { decodeCursor, getAuthenticatedSession } from '@/lib/api-helpers'
import { DEFAULT_CONTENTS_LIMIT, MAX_CONTENTS_LIMIT } from '@/lib/config'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { activeWatchLaterWhere, buildPaginationMeta, formatContent } from './helpers'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { searchParams } = request.nextUrl
    const now = new Date()

    const categoryId = searchParams.get('categoryId')
    if (!categoryId) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'categoryId は必須パラメータです',
        400,
      )
    }

    const cursorParam = searchParams.get('cursor')
    const orderParam = searchParams.get('order') ?? 'desc'
    const watchLaterOnlyParam = searchParams.get('watchLaterOnly') === 'true'
    const includeCancelledParam = searchParams.get('includeCancelled') === 'true'

    if (orderParam !== 'asc' && orderParam !== 'desc') {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'order は "asc" または "desc" を指定してください',
        400,
      )
    }

    let limit = DEFAULT_CONTENTS_LIMIT
    const limitParam = searchParams.get('limit')
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CONTENTS_LIMIT) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          `limit は 1 以上 ${MAX_CONTENTS_LIMIT} 以下の整数を指定してください`,
          400,
        )
      }
      limit = parsed
    }

    let cursorData: { contentAt: string; id: string } | null = null
    if (cursorParam) {
      cursorData = decodeCursor(cursorParam)
      if (!cursorData) {
        return errorResponse(
          ErrorCode.INVALID_CURSOR,
          'カーソルの形式が不正です',
          400,
        )
      }
    }

    let channelIds: string[]

    if (categoryId === 'uncategorized') {
      const channels = await prisma.channel.findMany({
        where: {
          userId: auth.userId,
          categoryId: null,
          isActive: true,
        },
        select: { id: true },
      })
      channelIds = channels.map((c) => c.id)
    } else {
      const channels = await prisma.channel.findMany({
        where: {
          category: {
            id: categoryId,
            userId: auth.userId,
          },
          isActive: true,
        },
        select: { id: true },
      })
      channelIds = channels.map((c) => c.id)
    }

    if (channelIds.length === 0) {
      return Response.json({
        data: [],
        meta: { hasNext: false, nextCursor: null },
      })
    }

    const where: Prisma.ContentWhereInput = {
      channelId: { in: channelIds },
    }

    if (!includeCancelledParam) {
      where.status = { not: 'CANCELLED' }
    }

    if (watchLaterOnlyParam) {
      where.watchLaters = {
        some: activeWatchLaterWhere(auth.userId, now),
      }
    }

    if (cursorData) {
      const cursorDate = new Date(cursorData.contentAt)
      if (orderParam === 'desc') {
        where.OR = [
          { contentAt: { lt: cursorDate } },
          { contentAt: cursorDate, id: { lt: cursorData.id } },
        ]
      } else {
        where.OR = [
          { contentAt: { gt: cursorDate } },
          { contentAt: cursorDate, id: { gt: cursorData.id } },
        ]
      }
    }

    const contents = await prisma.content.findMany({
      where,
      orderBy: [
        { contentAt: orderParam },
        { id: orderParam },
      ],
      take: limit + 1,
      include: {
        channel: {
          select: { name: true, iconUrl: true },
        },
        watchLaters: {
          where: activeWatchLaterWhere(auth.userId, now),
        },
      },
    })

    const meta = buildPaginationMeta(contents, limit)
    const data = contents.slice(0, limit).map((c) => formatContent(c, auth.userId, now))

    return Response.json({ data, meta })
  } catch (error) {
    console.error('[contents] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
