import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

import { activeWatchLaterWhere, formatContent } from '@/app/api/contents/helpers'
import { getAuthenticatedSession, isValidContentStatus } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/contents/{id}
 * コンテンツのステータスを手動変更する。
 *
 * ポーリングはこのコンテンツの status / contentAt / 配信時刻系を以後上書きしない
 * （`statusManuallySetAt` が NOT NULL の間）。タイトル・サムネイル等のメタデータは
 * 引き続きポーリングで更新される。
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const { id } = await context.params

    // 入力検証を先に済ませて、不正リクエストでは DB クエリを発生させない
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'リクエストボディが不正です', 400)
    }

    const { status } = (body ?? {}) as { status?: unknown }

    if (status === undefined || status === null) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'status は必須です', 400)
    }

    if (!isValidContentStatus(status)) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'status は UPCOMING / LIVE / ARCHIVED / CANCELLED のいずれかを指定してください',
        400,
      )
    }

    // 所有権チェック: 他ユーザー所有のコンテンツも 404 として扱う
    const existing = await prisma.content.findFirst({
      where: {
        id,
        channel: { userId: auth.userId },
      },
      select: { id: true },
    })
    if (!existing) {
      return errorResponse(ErrorCode.CONTENT_NOT_FOUND, 'コンテンツが見つかりません', 404)
    }

    const now = new Date()

    const updated = await prisma.content.update({
      where: { id },
      data: {
        status,
        statusManuallySetAt: now,
      },
      include: {
        channel: {
          select: { name: true, iconUrl: true },
        },
        watchLaters: {
          where: activeWatchLaterWhere(auth.userId, now),
        },
      },
    })

    return NextResponse.json(formatContent(updated, auth.userId, now))
  } catch (error) {
    // 所有権確認後に他プロセスでレコードが削除された場合、update は P2025 を投げる
    // → 404 として返す（呼び出し側に対し、既存パターンと同じ意味論）
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse(ErrorCode.CONTENT_NOT_FOUND, 'コンテンツが見つかりません', 404)
    }
    console.error('[contents] PATCH error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
