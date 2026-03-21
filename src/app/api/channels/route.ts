import { NextRequest, NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'

import { formatChannel } from './helpers'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const isActiveParam = searchParams.get('isActive')
    const categoryIdParam = searchParams.get('categoryId')

    // Default to true if not specified
    const isActive = isActiveParam === 'false' ? false : true

    // Build where clause
    const where: {
      userId: string
      isActive: boolean
      categoryId?: string | null
    } = {
      userId: auth.userId,
      isActive,
    }

    if (categoryIdParam) {
      if (categoryIdParam === 'uncategorized') {
        where.categoryId = null
      } else {
        where.categoryId = categoryIdParam
      }
    }

    const channels = await prisma.channel.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(channels.map(formatChannel))
  } catch (error) {
    console.error('[channels] GET error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
